import { setFrontmatter } from "../set.js";
import { appendErrorHistoryLine } from "../errorHistory.js";
import { emitEvent } from "../autopilot/eventBus.js";
import { decisionNeededMessage, formatImpactText, type Lang } from "../autopilot/messages.js";
import { recordDecision } from "./decisionLog.js";
import { decideAfterSeniorConsultation, decideManagerAction, type Situation } from "./managerPolicy.js";
import type { Finding } from "./finding.js";
import type { Notifier } from "../autopilot/notifier.js";
import { tasksOf, type Graph, type GraphNode } from "../graph/types.js";
import type { Config } from "../schema/index.js";

export interface FindingImpact {
  blockedTaskIds: string[];
  independentCount: number;
}

/** Roadmap 13.9'un "Etki" satırı için deterministik sayım (bkz. `messages.ts`'in
 * `formatImpactText`'i — burası sadece GRAPH'A bakan kısım, biçimleme ayrı). */
export function computeFindingImpact(graph: Graph, nodeId: string): FindingImpact {
  const tasks = tasksOf(graph);
  const blockedTaskIds = tasks
    .filter(
      (t) =>
        t.frontmatter.status === "pending" &&
        Array.isArray(t.frontmatter.depends_on) &&
        (t.frontmatter.depends_on as unknown[]).includes(nodeId),
    )
    .map((t) => t.id);
  const independentCount = tasks.filter(
    (t) =>
      t.id !== nodeId &&
      !blockedTaskIds.includes(t.id) &&
      !["done", "skipped"].includes(String(t.frontmatter.status)),
  ).length;
  return { blockedTaskIds, independentCount };
}

/** `Finding.kind` → 13.8'in karar tablosu `Situation`'ı. Roadmap'in `ambiguity`/
 * `tech_debt`'i AÇIKÇA bloklayan kategoriler olarak LİSTELEMİYOR (coder.md/senior.md'nin
 * kendi talimatı: "bloklayan SADECE güvenlik, veri kaybı, brief/kapsam çelişkisi ve
 * mimari değişiklik") — pratikte bu ikisi bloklayan gelmemeli, ama GELİRSE güvenli
 * varsayılan `scope_conflict` (ask_user'a çıkar, autonomy izin vermedikçe tahmin etmez). */
export const FINDING_KIND_TO_SITUATION: Record<Finding["kind"], Situation> = {
  security: "security_vulnerability",
  plan_conflict: "scope_conflict",
  out_of_scope: "scope_conflict",
  ambiguity: "scope_conflict",
  tech_debt: "scope_conflict",
};

export type FindingOutcome =
  | { kind: "proceeded_with_recommended"; nodeId: string; chosenOptionIndex: number }
  | { kind: "self_resolved"; nodeId: string; chosenOptionIndex: number }
  | { kind: "needs_senior_consultation"; nodeId: string; situation: Situation }
  | { kind: "stopped"; nodeId: string }
  | { kind: "user_chose"; nodeId: string; chosenOptionIndex: number };

function recordFindingDecision(
  graph: Graph,
  node: GraphNode,
  finding: Finding,
  chosenOptionIndex: number,
  decidedBy: string,
): void {
  if (!node.epicId) return;
  recordDecision(graph, {
    epicId: node.epicId,
    nodeId: node.id,
    summary: `${finding.summary} → ${finding.options[chosenOptionIndex]}`,
    decidedBy,
    optionsCount: finding.options.length,
  });
}

/**
 * Roadmap 13.7 — ilk/mekanik kapı: `severity` bloklayan mı değil mi. Bloklamıyorsa
 * ekip üyesi zaten önerilen seçenekle devam etmiş SAYILIR (gerçek "devam etme" eylemi
 * agent'ın kendi işi — burası sadece KAYDEDER). Bloklayan ise düğümü `needs_decision`
 * yapar ve 13.8'in politika tablosuna göre dallanır: `self` burada biter, `ask_user`
 * burada Telegram'dan sorulup biter, `consult_senior` ise GERÇEK bir Agent tool çağrısı
 * gerektirir (bu fonksiyonun kapsamı DIŞINDA — çağıran taraf senior'ı çağırıp cevabıyla
 * `resolveAfterSeniorConsultation`'ı çağırmalı).
 */
export async function handleFinding(opts: {
  graph: Graph;
  graphRootDir: string;
  config: Config;
  notifier: Notifier;
  lang: Lang;
  node: GraphNode;
  finding: Finding;
}): Promise<FindingOutcome> {
  const { graph, graphRootDir, config, notifier, lang, node, finding } = opts;

  if (finding.severity === "non_blocking") {
    appendErrorHistoryLine(
      node.filePath,
      `${node.id} bulgu (bloklamayan, ${finding.kind}): ${finding.summary} → ${finding.options[finding.recommended]}`,
    );
    recordFindingDecision(graph, node, finding, finding.recommended, "manager");
    return { kind: "proceeded_with_recommended", nodeId: node.id, chosenOptionIndex: finding.recommended };
  }

  setFrontmatter(graph, node.id, { status: "needs_decision" });
  emitEvent(graphRootDir, { type: "needs_decision", nodeId: node.id, message: finding.summary, data: { finding } });
  appendErrorHistoryLine(node.filePath, `${node.id} bulgu (BLOKLAYAN, ${finding.kind}): ${finding.summary}`);

  const situation = FINDING_KIND_TO_SITUATION[finding.kind];
  const action = decideManagerAction(situation, config.team.manager.autonomy);

  if (action === "self") return applySelfResolution(graph, node, finding);
  if (action === "consult_senior") return { kind: "needs_senior_consultation", nodeId: node.id, situation };
  return askUserAndResolve({ graph, graphRootDir, notifier, lang, node, finding });
}

/** `consult_senior` dalının TAMAMLANMASI — çağıran taraf GERÇEK senior danışmasını
 * (Agent tool) yapıp sonucu `seniorGaveConfidentRecommendation`'a çevirdikten sonra çağırır. */
export async function resolveAfterSeniorConsultation(opts: {
  graph: Graph;
  graphRootDir: string;
  notifier: Notifier;
  lang: Lang;
  node: GraphNode;
  finding: Finding;
  seniorGaveConfidentRecommendation: boolean;
}): Promise<FindingOutcome> {
  const action = decideAfterSeniorConsultation(opts.seniorGaveConfidentRecommendation);
  if (action === "self") {
    const outcome = applySelfResolution(opts.graph, opts.node, opts.finding);
    recordFindingDecisionOverride(opts.graph, opts.node, opts.finding, "manager+senior");
    return outcome;
  }
  return askUserAndResolve(opts);
}

function recordFindingDecisionOverride(graph: Graph, node: GraphNode, finding: Finding, decidedBy: string): void {
  // `applySelfResolution` zaten "manager" olarak kaydetti; senior danışmasından geçtiyse
  // "manager+senior" olarak AYRICA (ek bir satır) not edilir — mevcut kaydı SİLMEZ/EZMEZ
  // (append-only günlük, roadmap 13.11'in doğasıyla tutarlı).
  if (!node.epicId) return;
  recordDecision(graph, {
    epicId: node.epicId,
    nodeId: node.id,
    summary: `(senior danışması sonrası onay) ${finding.summary}`,
    decidedBy,
    optionsCount: finding.options.length,
  });
}

function applySelfResolution(graph: Graph, node: GraphNode, finding: Finding): FindingOutcome {
  setFrontmatter(graph, node.id, { status: "pending" });
  appendErrorHistoryLine(node.filePath, `${node.id} karar (yönetici): ${finding.options[finding.recommended]}`);
  recordFindingDecision(graph, node, finding, finding.recommended, "manager");
  return { kind: "self_resolved", nodeId: node.id, chosenOptionIndex: finding.recommended };
}

async function askUserAndResolve(opts: {
  graph: Graph;
  graphRootDir: string;
  notifier: Notifier;
  lang: Lang;
  node: GraphNode;
  finding: Finding;
}): Promise<FindingOutcome> {
  const { graph, graphRootDir, notifier, lang, node, finding } = opts;
  const impact = computeFindingImpact(graph, node.id);
  const msg = decisionNeededMessage(lang, {
    nodeId: node.id,
    nodeTitle: node.name,
    situation: finding.summary,
    impactText: formatImpactText(lang, impact),
    recommendedOption: finding.options[finding.recommended],
    options: finding.options,
    recommendedIndex: finding.recommended,
  });

  const answer = await notifier.ask(msg.text, msg.buttons ?? []);

  if (answer === "stop") {
    setFrontmatter(graph, node.id, { status: "failed" });
    appendErrorHistoryLine(node.filePath, `${node.id} karar (kullanıcı): durduruldu`);
    recordFindingDecision(graph, node, finding, finding.recommended, "user (Telegram)");
    emitEvent(graphRootDir, { type: "decision_answered", nodeId: node.id, data: { decidedBy: "user", stopped: true } });
    return { kind: "stopped", nodeId: node.id };
  }

  const chosenOptionIndex = Number(answer);
  setFrontmatter(graph, node.id, { status: "pending" });
  appendErrorHistoryLine(node.filePath, `${node.id} karar (kullanıcı): ${finding.options[chosenOptionIndex]}`);
  recordFindingDecision(graph, node, finding, chosenOptionIndex, "user (Telegram)");
  emitEvent(graphRootDir, { type: "decision_answered", nodeId: node.id, data: { decidedBy: "user" } });
  return { kind: "user_chose", nodeId: node.id, chosenOptionIndex };
}
