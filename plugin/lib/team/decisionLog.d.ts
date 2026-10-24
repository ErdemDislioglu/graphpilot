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
/**
 * Roadmap 13.11 — her kararı (1) `_metrics/decisions.jsonl`'e (stabil `id`, `/override`
 * aramaları için) ve (2) ilgili epic'in karar günlüğü knowledge node'unun `## Kararlar`
 * bölümüne (insan-okur biçim, roadmap örneğiyle birebir) yazar.
 */
export declare function recordDecision(graph: Graph, input: DecisionInput): DecisionRecord;
export declare function readDecisions(graphRootDir: string): DecisionRecord[];
export declare function findDecision(graphRootDir: string, decisionId: string): DecisionRecord | null;
/**
 * Roadmap 13.11 — "Geri çevirme: `/override <karar-id>` → yönetici düzeltme görevi açar.
 * Geri çevrilen kararlar `_metrics/decisions.jsonl`'e işaretlenir." Bu fonksiyon SADECE
 * işaretlemeyi yapar (metrics dosyasını yeniden yazar) — düzeltme görevi açmak çağıranın
 * işi (CLI/skill katmanı, hangi task türünün açılacağına karar verir).
 */
export declare function markDecisionOverridden(graphRootDir: string, decisionId: string): boolean;
