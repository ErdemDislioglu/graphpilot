import { setFrontmatter } from "../set.js";
import { appendErrorHistoryLine } from "../errorHistory.js";
import { escalateNode } from "../escalate.js";
import { emitEvent } from "./eventBus.js";
import { recordDecision } from "../team/decisionLog.js";
import {
  OPTION_VALUE_PREFIX,
  failureApprovalMessage,
  limitMessage,
  riskApprovalMessage,
  type Lang,
} from "./messages.js";
import type { Notifier } from "./notifier.js";
import type { Config } from "../schema/index.js";
import { getDependsOn, type Graph, type GraphNode } from "../graph/types.js";
import type { AgentQuestion } from "../runModeB.js";

export type ApprovalDecision = "retry" | "escalate" | "skip" | "stop" | "approve";
export type ApprovalKind = "failure" | "risk";

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
export function needsApproval(node: GraphNode, config: Config, graph: Graph): boolean {
  if (node.frontmatter.status === "failed") return true;
  return needsRiskApproval(node, config, graph);
}

/**
 * Roadmap 12.6 düzeltmesi — risk onayı YALNIZ gerçekten sıradaki görev için: `pending`,
 * tüm bağımlılıkları `done` (yani `computeNext`'in "ready" tanımı) ve daha önce
 * onaylanmamış (`approved: true` yok). Eskiden her turda done olanlar dahil tüm
 * `risk: high` görevler soruluyordu; "retry" bitmiş görevi baştan çalıştırıyordu.
 */
export function needsRiskApproval(node: GraphNode, config: Config, graph: Graph): boolean {
  if (!config.autopilot.approvals.on_risk_high) return false;
  if (node.frontmatter.risk !== "high" || node.frontmatter.approved === true) return false;
  if (node.frontmatter.status !== "pending") return false;
  return getDependsOn(graph, node.id).every((d) => d.frontmatter.status === "done");
}

const TIMEOUT_SENTINEL = Symbol("autopilot-approval-timeout");
type Timeout = typeof TIMEOUT_SENTINEL;
const timeoutAfter = (sleep: (ms: number) => Promise<void>, ms: number): Promise<Timeout> =>
  sleep(ms).then((): Timeout => TIMEOUT_SENTINEL);

async function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * `ask()`'ın cevabı ancak biri `poller.pollOnce()` çağırınca gelir (telegramNotifier.ts) —
 * onay beklerken ana döngü durduğu için `poll` verilirse bekleme parçalara bölünür ve her
 * parça arasında poll edilir. Verilmezse (testler) tek parça bekleme — eski davranış.
 */
async function waitForAnswer(
  askPromise: Promise<string>,
  timeoutMs: number,
  sleep: (ms: number) => Promise<void>,
  poll?: () => Promise<void>,
  chunkMs = 15_000,
): Promise<string | Timeout> {
  if (!poll) return Promise.race([askPromise, timeoutAfter(sleep, timeoutMs)]);
  let remaining = timeoutMs;
  while (remaining > 0) {
    const step = Math.min(chunkMs, remaining);
    const result = await Promise.race([askPromise, timeoutAfter(sleep, step)]);
    if (result !== TIMEOUT_SENTINEL) return result;
    remaining -= step;
    await poll();
  }
  return TIMEOUT_SENTINEL;
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
  /** Varsayılan "failure" (12.6'nın başarısızlık onayı). "risk": `risk: high` başlatma onayı. */
  kind?: ApprovalKind;
  sleep?: (ms: number) => Promise<void>;
  /** Bekleme sırasında Telegram güncellemelerini işlemek için (`poller.pollOnce`). */
  poll?: () => Promise<void>;
  pollIntervalMs?: number;
}): Promise<ApprovalOutcome> {
  const { graph, graphRootDir, config, notifier, lang, node } = opts;
  const sleep = opts.sleep ?? sleepMs;
  const kind = opts.kind ?? "failure";

  // Risk onayında görev `pending` kalır: bekleme sırasında süreç düşerse ya da zaman
  // aşımı "stop" ise görev kaybolmaz, sonraki başlatmada yeniden sorulur.
  if (kind === "failure") setFrontmatter(graph, node.id, { status: "needs_decision" });
  emitEvent(graphRootDir, {
    type: "needs_decision",
    nodeId: node.id,
    message: kind === "risk" ? "risk: high" : opts.lastError,
  });

  const msg =
    kind === "risk"
      ? riskApprovalMessage(lang, { nodeId: node.id, nodeTitle: node.name })
      : failureApprovalMessage(lang, {
          nodeId: node.id,
          nodeTitle: node.name,
          attempts: opts.attempts,
          lastError: opts.lastError,
        });

  const timeoutMs = config.autopilot.approvals.timeout_minutes * 60_000;
  const askPromise = notifier.ask(msg.text, msg.buttons ?? []);
  const result = await waitForAnswer(askPromise, timeoutMs, sleep, opts.poll, opts.pollIntervalMs);
  const timedOut = result === TIMEOUT_SENTINEL;
  const decision: ApprovalDecision = timedOut
    ? config.autopilot.approvals.timeout_action
    : (result as ApprovalDecision);

  if (kind === "risk") applyRiskDecision(graph, node, decision);
  else applyDecision(graph, node, config, decision);

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
      unblockDependents(graph, node.id);
      break;
    case "escalate":
      escalateNode(graph, node.id, config);
      setFrontmatter(graph, node.id, { status: "pending" });
      unblockDependents(graph, node.id);
      break;
    case "skip":
      setFrontmatter(graph, node.id, { status: "skipped" });
      break;
    case "stop":
      setFrontmatter(graph, node.id, { status: "failed" });
      break;
    case "approve":
      break; // yalnız risk onayında anlamlı (applyRiskDecision)
  }
}

/**
 * `failNode` (fail.ts) başarısız görevin `pending` bağımlılarını `blocked` yapar. Görev
 * yeniden kuyruğa girince bunlar `pending`'e dönmeli — yoksa görev sonra done olsa bile
 * bağımlılar hiç "ready" olmaz ve otopilot sessizce takılı kalır.
 */
export function unblockDependents(graph: Graph, nodeId: string): string[] {
  const unblocked: string[] = [];
  for (const other of graph.nodesById.values()) {
    if (other.kind !== "task" || other.frontmatter.status !== "blocked") continue;
    const deps = Array.isArray(other.frontmatter.depends_on) ? other.frontmatter.depends_on : [];
    if (!deps.includes(nodeId)) continue;
    if (setFrontmatter(graph, other.id, { status: "pending" }).ok) unblocked.push(other.id);
  }
  return unblocked;
}

/** Risk onayı: approve → `approved: true` (pending kalır, döngü çalıştırır); stop görevi
 * `failed` YAPMAZ — yalnız otopilot durur, görev sonra kaldığı yerden sorulur. */
function applyRiskDecision(graph: Graph, node: GraphNode, decision: ApprovalDecision): void {
  if (decision === "approve") setFrontmatter(graph, node.id, { approved: "true" });
  else if (decision === "skip") setFrontmatter(graph, node.id, { status: "skipped" });
}

/**
 * Faz 12 — agent `blocked:` döndü (exit 0 olsa da). Escalation'a SOKULMAZ (model
 * değiştirmek bir kararı çözmez): görev `needs_decision` olur, neden `## Hata geçmişi`'ne
 * yazılır. Bağımlıları `computeNext` gereği bekler; bağımsız işler devam eder.
 */
export function markBlocked(graph: Graph, graphRootDir: string, node: GraphNode, reason: string, question?: AgentQuestion): void {
  setFrontmatter(graph, node.id, { status: "needs_decision" });
  appendErrorHistoryLine(node.filePath, `${node.id} blocked: ${reason}${question ? ` — soru: ${question.text}` : ""}`);
  emitEvent(graphRootDir, { type: "needs_decision", nodeId: node.id, message: reason, data: { blocked: true, question } });
}

/**
 * `markBlocked` sonrası Telegram cevabını uygular. `opt:<i>` (mimari karar seçeneği) →
 * seçim `## Hata geçmişi`'ne "karar (kullanıcı)" olarak yazılır (görev yeniden
 * çalışınca bağlam paketinde görünür) ve epic karar günlüğüne (13.11) işlenir, görev
 * `pending`'e döner. retry → pending, skip → skipped. stop → görev `pending`'e döner
 * (otopilot yeniden başlatılınca tekrar denenir/sorulur), çağıran taraf döngüyü durdurur.
 */
export function applyBlockedAnswer(
  graph: Graph,
  graphRootDir: string,
  node: GraphNode,
  answer: string,
  question?: AgentQuestion,
  decidedBy: "kullanıcı" | "otomatik" = "kullanıcı",
): ApprovalDecision {
  let decision: ApprovalDecision;
  let line: string;
  if (answer.startsWith(OPTION_VALUE_PREFIX) && question) {
    const chosen = question.options[Number(answer.slice(OPTION_VALUE_PREFIX.length))] ?? answer;
    decision = "retry";
    line = `${node.id} karar (${decidedBy}): ${question.text} → ${chosen}`;
    // Epic düğümü graph'ta yoksa (ör. elle oluşturulmuş tek görev) günlük düğümü açılamaz.
    if (node.epicId && graph.nodesById.get(node.epicId)?.kind === "epic") {
      recordDecision(graph, {
        epicId: node.epicId,
        nodeId: node.id,
        summary: `${question.text} → ${chosen}`,
        decidedBy: decidedBy === "otomatik" ? "autopilot (önerilen)" : "user (Telegram)",
        optionsCount: question.options.length,
      });
    }
  } else {
    decision = answer === "skip" || answer === "stop" ? answer : "retry";
    line = `${node.id} karar${decidedBy === "otomatik" ? " (otomatik)" : ""}: ${decision}`;
  }
  setFrontmatter(graph, node.id, { status: decision === "skip" ? "skipped" : "pending" });
  appendErrorHistoryLine(node.filePath, line);
  emitEvent(graphRootDir, { type: "decision_answered", nodeId: node.id, data: { decision, blocked: true, decidedBy } });
  return decision;
}

/**
 * Roadmap 12.6 — `approvals.on_failure: skip|stop` (config'te vardı ama döngü okumuyordu,
 * her `failed` görev soruluyordu). Soru sorulmaz; karar Hata geçmişi'ne ve events.jsonl'e
 * yazılır, kullanıcıya bilgi mesajı gider. skip → `skipped`; stop → görev `failed` kalır,
 * çağıran taraf otopilotu durdurur (yeniden başlatınca `gp set` ile düzeltilene dek yine durur).
 */
export async function applyFailurePolicy(opts: {
  graph: Graph;
  graphRootDir: string;
  notifier: Notifier;
  lang: Lang;
  node: GraphNode;
  action: "skip" | "stop";
  lastError: string;
}): Promise<void> {
  const { graph, graphRootDir, notifier, lang, node, action, lastError } = opts;
  if (action === "skip") setFrontmatter(graph, node.id, { status: "skipped" });
  appendErrorHistoryLine(node.filePath, `${node.id} karar (on_failure): ${action}`);
  emitEvent(graphRootDir, { type: "decision_answered", nodeId: node.id, data: { decision: action, decidedBy: "on_failure" } });
  const tr =
    action === "skip"
      ? `⚠️ ${node.id} "${node.name}" başarısız (son hata: ${lastError}) — on_failure: skip, atlandı.`
      : `🛑 ${node.id} "${node.name}" başarısız (son hata: ${lastError}) — on_failure: stop, otopilot durdu.`;
  const en =
    action === "skip"
      ? `⚠️ ${node.id} "${node.name}" failed (last error: ${lastError}) — on_failure: skip, skipped.`
      : `🛑 ${node.id} "${node.name}" failed (last error: ${lastError}) — on_failure: stop, autopilot stopped.`;
  await notifier.send(lang === "tr" ? tr : en);
}

/**
 * Kullanıcı isteği (2026-10-30) — Telegram'dan yalnız `risk: high` görevler sorulur.
 * Diğerlerinde `blocked` kararı otomatik: agent'ın `(önerilen)` seçeneği (işaret yoksa
 * ilki) seçilip görev yeniden çalışır; soru yoksa görev atlanır (bağımlıları bekler).
 * `failed` görevlerin onay akışı bundan etkilenmez.
 */
export function autoBlockedAnswer(question?: AgentQuestion): string {
  if (!question) return "skip";
  return `${OPTION_VALUE_PREFIX}${question.recommended ?? 0}`;
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
