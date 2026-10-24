import { appendMetric, readMetrics } from "../metrics.js";
const FILE = "tagging.jsonl";
/**
 * Roadmap 13.4 — "Geri besleme döngüsü": junior başarısız olup senior'a aktarılan görev
 * → `underestimated`; senior'ın tek turda çok az token'la bitirdiği görev →
 * `overestimated` adayı. `_metrics/tagging.jsonl`'e yazılır (Faz 6.3'ün `metrics.ts`'i
 * yeniden kullanılır — yeni bir dosya biçimi icat edilmedi).
 */
export function recordMisTag(graphRootDir, record) {
    appendMetric(graphRootDir, FILE, { ...record, ts: new Date().toISOString() });
}
export function readMisTagRecords(graphRootDir) {
    return readMetrics(graphRootDir, FILE);
}
export function summarizeMisTags(graphRootDir) {
    const records = readMisTagRecords(graphRootDir);
    return {
        total: records.length,
        underestimated: records.filter((r) => r.direction === "underestimated").length,
        overestimated: records.filter((r) => r.direction === "overestimated").length,
    };
}
/** "Yanlış tag oranı" — roadmap 13.4/13.13. `totalDoneTasks` çağıran tarafından verilir
 * (bu modül graph'a bağımlı değil, sadece metrik dosyasını okur/yazar). */
export function computeMisTagRatio(graphRootDir, totalDoneTasks) {
    if (totalDoneTasks <= 0)
        return 0;
    return summarizeMisTags(graphRootDir).total / totalDoneTasks;
}
