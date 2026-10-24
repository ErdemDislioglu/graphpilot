import { setFrontmatter } from "../set.js";
import { appendErrorHistoryLine } from "../errorHistory.js";
import { escalateNode } from "../escalate.js";
import { emitEvent } from "./eventBus.js";
import { failureApprovalMessage, limitMessage, type Lang } from "./messages.js";
import type { Notifier } from "./notifier.js";
import type { Config } from "../schema/index.js";
import type { Graph, GraphNode } from "../graph/types.js";

export type ApprovalDecision = "retry" | "escalate" | "skip" | "stop";

export interface ApprovalOutcome {
  nodeId: string;
  decision: ApprovalDecision;
  timedOut: boolean;
}

/**
 * Roadmap 12.6 — "risk: high düğüm (config ile opsiyonel)". `failed` durumu BURADA
 * tekrar KONTROL EDİLMEZ: `failNode` (fail.ts) zaten sadece doğrulama döngüsü + escalation
 * zinciri tükendiğinde çağrılıyor (SPEC/roadmap 6.5) — bir düğümün `status === "failed"`
 * olması kendi başına "doğrulama döngüsü ve yükseltme sonrası" koşulunu karşılar.
 */
export function needsApproval(node: GraphNode, config: Config): boolean {
  if (node.frontmatter.status === "failed") return true;
  if (config.autopilot.approvals.on_risk_high && node.frontmatter.risk === "high") return true;
  return false;
}

const TIMEOUT_SENTINEL = Symbol("autopilot-approval-timeout");

async function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Roadmap 12.6 — tam onay akışı: düğümü `needs_decision` yapar (bu sırada SADECE ona
 * bağımlı düğümler bekler — `computeNext`/`next.ts` zaten "done değilse bağımlı bekler"
 * mantığıyla bunu otomatik sağlar, ayrı bir kod değişikliği gerekmez), Telegram'dan
 * butonlu soru sorar, `timeout_minutes` içinde cevap gelmezse `timeout_action`
 * uygulanır. Her karar `events.jsonl`'e ve düğümün `## Hata geçmişi`'ne yazılır.
 */
export async function requestApproval(opts: {
  graph: Graph;
  graphRootDir: string;
  config: Config;
  notifier: Notifier;
  lang: Lang;
  node: GraphNode;
  attempts: number;
  lastError: string;
  sleep?: (ms: number) => Promise<void>;
}): Promise<ApprovalOutcome> {
  const { graph, graphRootDir, config, notifier, lang, node } = opts;
  const sleep = opts.sleep ?? sleepMs;

  setFrontmatter(graph, node.id, { status: "needs_decision" });
  emitEvent(graphRootDir, {
    type: "needs_decision",
    nodeId: node.id,
    message: opts.lastError,
  });

  const msg = failureApprovalMessage(lang, {
    nodeId: node.id,
    nodeTitle: node.name,
    attempts: opts.attempts,
    lastError: opts.lastError,
  });

  const timeoutMs = config.autopilot.approvals.timeout_minutes * 60_000;
  const askPromise = notifier.ask(msg.text, msg.buttons ?? []);
  const timeoutPromise = sleep(timeoutMs).then(() => TIMEOUT_SENTINEL as typeof TIMEOUT_SENTINEL);

  const result = await Promise.race([askPromise, timeoutPromise]);
  const timedOut = result === TIMEOUT_SENTINEL;
  const decision: ApprovalDecision = timedOut
    ? config.autopilot.approvals.timeout_action
    : (result as ApprovalDecision);

  applyDecision(graph, node, config, decision);

  emitEvent(graphRootDir, {
    type: "decision_answered",
    nodeId: node.id,
    data: { decision, timedOut },
  });
  appendErrorHistoryLine(
    node.filePath,
    `${node.id} karar: ${decision}${timedOut ? " (zaman aşımı — otomatik)" : ""}`,
  );

  if (timedOut) {
    await notifier.send(
      lang === "tr"
        ? `⏱ ${node.id} için zaman aşımı — otomatik karar: ${decision}.`
        : `⏱ Timeout for ${node.id} — automatic decision: ${decision}.`,
    );
  }

  return { nodeId: node.id, decision, timedOut };
}

function applyDecision(graph: Graph, node: GraphNode, config: Config, decision: ApprovalDecision): void {
  switch (decision) {
    case "retry":
      setFrontmatter(graph, node.id, { status: "pending" });
      break;
    case "escalate":
      escalateNode(graph, node.id, config);
      setFrontmatter(graph, node.id, { status: "pending" });
      break;
    case "skip":
      setFrontmatter(graph, node.id, { status: "skipped" });
      break;
    case "stop":
      setFrontmatter(graph, node.id, { status: "failed" });
      break;
  }
}

/**
 * Roadmap 12.6 — deadlock için düzeltici tek bir "doğru" eylem yok (hangi düğümü
 * tekrar/atla/durdur seçilecek belirsiz — kökteki düğüm genelde zaten kendi `failed`
 * onayından geçmiş olur). Bu yüzden deadlock butonlu bir `ask()` DEĞİL, bir bilgi
 * mesajıdır — kullanıcı `gp set`/Telegram `/stop` ile elle müdahale eder.
 */
export async function notifyDeadlock(opts: {
  graphRootDir: string;
  notifier: Notifier;
  lang: Lang;
  reasons: { nodeId: string; blockedBy: string; blockerStatus: string }[];
}): Promise<void> {
  const { graphRootDir, notifier, lang, reasons } = opts;
  emitEvent(graphRootDir, { type: "failure", message: "deadlock", data: { reasons } });
  const list = reasons.map((r) => `${r.nodeId} ⇐ ${r.blockedBy} (${r.blockerStatus})`).join(", ");
  await notifier.send(
    lang === "tr"
      ? `🛑 Deadlock: hiçbir düğüm ilerleyemiyor. ${list}. Elle müdahale gerekiyor (gp set / /stop).`
      : `🛑 Deadlock: no node can progress. ${list}. Manual intervention needed (gp set / /stop).`,
  );
}

/** Roadmap 12.5/12.7 — limit bildirimi için `limitMessage` şablonunu gönderir. */
export async function notifyLimit(opts: {
  graphRootDir: string;
  notifier: Notifier;
  lang: Lang;
  resetHint?: string;
  doneCount: number;
  totalCount: number;
}): Promise<void> {
  const { graphRootDir, notifier, lang, ...counts } = opts;
  emitEvent(graphRootDir, { type: "limit_hit", data: counts });
  const msg = limitMessage(lang, counts);
  await notifier.send(msg.text);
}
