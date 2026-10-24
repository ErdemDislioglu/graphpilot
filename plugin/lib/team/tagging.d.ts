export type MisTagDirection = "underestimated" | "overestimated";
export interface MisTagRecord {
    nodeId: string;
    direction: MisTagDirection;
    reason: string;
}
/**
 * Roadmap 13.4 — "Geri besleme döngüsü": junior başarısız olup senior'a aktarılan görev
 * → `underestimated`; senior'ın tek turda çok az token'la bitirdiği görev →
 * `overestimated` adayı. `_metrics/tagging.jsonl`'e yazılır (Faz 6.3'ün `metrics.ts`'i
 * yeniden kullanılır — yeni bir dosya biçimi icat edilmedi).
 */
export declare function recordMisTag(graphRootDir: string, record: MisTagRecord): void;
export interface MisTagSummary {
    total: number;
    underestimated: number;
    overestimated: number;
}
export declare function readMisTagRecords(graphRootDir: string): (MisTagRecord & {
    ts: string;
})[];
export declare function summarizeMisTags(graphRootDir: string): MisTagSummary;
/** "Yanlış tag oranı" — roadmap 13.4/13.13. `totalDoneTasks` çağıran tarafından verilir
 * (bu modül graph'a bağımlı değil, sadece metrik dosyasını okur/yazar). */
export declare function computeMisTagRatio(graphRootDir: string, totalDoneTasks: number): number;
