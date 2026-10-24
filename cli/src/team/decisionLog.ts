import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import matter from "gray-matter";
import { appendMetric, readMetrics } from "../metrics.js";
import { appendToSection } from "../markdown.js";
import { writeFileAtomic } from "../atomicWrite.js";
import { createNewNode } from "../newNode.js";
import type { Graph } from "../graph/types.js";

export interface DecisionInput {
  epicId: string;
  nodeId: string;
  summary: string;
  /** Serbest metin — roadmap örneği: "manager", "manager+senior", "user (Telegram)". */
  decidedBy: string;
  optionsCount: number;
}

export interface DecisionRecord extends DecisionInput {
  id: string;
  ts: string;
  overridden: boolean;
}

const METRICS_FILE = "decisions.jsonl";

/**
 * Roadmap 13.11 — knowledge node ID'leri GRAPH GENELİNDE benzersizdir (`nodesByName`,
 * `graph/parser.ts` — "tekrarlanan name" global kontrol). SPEC.md'nin örnek klasör
 * ağacındaki bare "decisions.md" (her epic'in KENDİ `knowledge/decisions.md`'si) bu
 * yüzden BİREBİR UYGULANAMAZ — iki epic aynı "decisions" slug'ını kullanamaz. Bu yüzden
 * epic-kapsamlı bir slug seçildi: `e01-decisions` gibi (epic ID küçük harfe çevrilip
 * önek yapılır) — SPEC'in niyetiyle (epic-başına karar günlüğü) tutarlı, ID çakışmasız.
 */
function decisionsKnowledgeSlug(epicId: string): string {
  return `${epicId.toLowerCase()}-decisions`;
}

function ensureDecisionsKnowledgeNode(graph: Graph, epicId: string): string {
  const slug = decisionsKnowledgeSlug(epicId);

  // DİKKAT: `graph.nodesById` bu çağrı sırasında TAZE olmayabilir (aynı `graph` nesnesiyle
  // art arda `recordDecision` çağrılırsa, önceki çağrının `createNewNode`'u diski günceller
  // ama `graph` nesnesini YENİDEN PARSE ETMEZ) — bu yüzden varlık kontrolü in-memory index
  // DEĞİL, gerçek dosya sistemi üzerinden yapılır (aksi halde ikinci çağrı dosyayı SIFIRDAN
  // şablonla EZER, önceki kararları siler).
  const epicNode = graph.nodesById.get(epicId);
  if (epicNode) {
    const expectedPath = join(dirname(epicNode.filePath), "knowledge", `${slug}.md`);
    if (existsSync(expectedPath)) return expectedPath;
  }

  const existing = graph.nodesById.get(slug);
  if (existing) return existing.filePath;

  const result = createNewNode(graph, {
    kind: "knowledge",
    slug,
    parent: epicId,
    summary: `${epicId} için yöneticinin/kullanıcının verdiği kararların günlüğü (Faz 13.11).`,
  });
  return result.filePath;
}

/**
 * Roadmap 13.11 — her kararı (1) `_metrics/decisions.jsonl`'e (stabil `id`, `/override`
 * aramaları için) ve (2) ilgili epic'in karar günlüğü knowledge node'unun `## Kararlar`
 * bölümüne (insan-okur biçim, roadmap örneğiyle birebir) yazar.
 */
export function recordDecision(graph: Graph, input: DecisionInput): DecisionRecord {
  const priorCount = readMetrics(graph.rootDir, METRICS_FILE).length;
  const id = `${input.nodeId}-D${priorCount + 1}`;
  const record: DecisionRecord = { ...input, id, ts: new Date().toISOString(), overridden: false };
  appendMetric(graph.rootDir, METRICS_FILE, record as unknown as Record<string, unknown>);

  const filePath = ensureDecisionsKnowledgeNode(graph, input.epicId);
  const dateStr = record.ts.slice(0, 10);
  const line = `${dateStr} · ${record.nodeId} · ${record.summary} · karar veren: ${record.decidedBy} · seçenekler: ${record.optionsCount} · id: ${record.id}`;
  const parsed = matter(readFileSync(filePath, "utf-8"));
  writeFileAtomic(filePath, matter.stringify(appendToSection(parsed.content, "Kararlar", line), parsed.data));

  return record;
}

export function readDecisions(graphRootDir: string): DecisionRecord[] {
  return readMetrics(graphRootDir, METRICS_FILE) as unknown as DecisionRecord[];
}

export function findDecision(graphRootDir: string, decisionId: string): DecisionRecord | null {
  return readDecisions(graphRootDir).find((d) => d.id === decisionId) ?? null;
}

/**
 * Roadmap 13.11 — "Geri çevirme: `/override <karar-id>` → yönetici düzeltme görevi açar.
 * Geri çevrilen kararlar `_metrics/decisions.jsonl`'e işaretlenir." Bu fonksiyon SADECE
 * işaretlemeyi yapar (metrics dosyasını yeniden yazar) — düzeltme görevi açmak çağıranın
 * işi (CLI/skill katmanı, hangi task türünün açılacağına karar verir).
 */
export function markDecisionOverridden(graphRootDir: string, decisionId: string): boolean {
  const all = readDecisions(graphRootDir);
  const idx = all.findIndex((d) => d.id === decisionId);
  if (idx === -1) return false;
  all[idx] = { ...all[idx], overridden: true };
  rewriteDecisionsMetrics(graphRootDir, all);
  return true;
}

function rewriteDecisionsMetrics(graphRootDir: string, records: DecisionRecord[]): void {
  // metrics.ts sadece EKLEME destekliyor (append-only JSONL) — işaretleme için dosyanın
  // tamamını yeniden yazmak gerekiyor, bu yüzden appendMetric'i YENİDEN KULLANMIYORUZ.
  const path = join(graphRootDir, "_metrics", METRICS_FILE);
  writeFileAtomic(path, records.map((r) => JSON.stringify(r)).join("\n") + (records.length > 0 ? "\n" : ""));
}
