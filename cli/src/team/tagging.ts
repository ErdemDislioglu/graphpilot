import { appendMetric, readMetrics } from "../metrics.js";

export type MisTagDirection = "underestimated" | "overestimated";

export interface MisTagRecord {
  nodeId: string;
  direction: MisTagDirection;
  reason: string;
}

const FILE = "tagging.jsonl";

/**
 * Roadmap 13.4 — "Geri besleme döngüsü": junior başarısız olup senior'a aktarılan görev
 * → `underestimated`; senior'ın tek turda çok az token'la bitirdiği görev →
 * `overestimated` adayı. `_metrics/tagging.jsonl`'e yazılır (Faz 6.3'ün `metrics.ts`'i
 * yeniden kullanılır — yeni bir dosya biçimi icat edilmedi).
 */
export function recordMisTag(graphRootDir: string, record: MisTagRecord): void {
  appendMetric(graphRootDir, FILE, { ...record, ts: new Date().toISOString() });
}

export interface MisTagSummary {
  total: number;
  underestimated: number;
  overestimated: number;
}

export function readMisTagRecords(graphRootDir: string): (MisTagRecord & { ts: string })[] {
  return readMetrics(graphRootDir, FILE) as unknown as (MisTagRecord & { ts: string })[];
}

export function summarizeMisTags(graphRootDir: string): MisTagSummary {
  const records = readMisTagRecords(graphRootDir);
  return {
    total: records.length,
    underestimated: records.filter((r) => r.direction === "underestimated").length,
    overestimated: records.filter((r) => r.direction === "overestimated").length,
  };
}

/** "Yanlış tag oranı" — roadmap 13.4/13.13. `totalDoneTasks` çağıran tarafından verilir
 * (bu modül graph'a bağımlı değil, sadece metrik dosyasını okur/yazar). */
export function computeMisTagRatio(graphRootDir: string, totalDoneTasks: number): number {
  if (totalDoneTasks <= 0) return 0;
  return summarizeMisTags(graphRootDir).total / totalDoneTasks;
}
