/**
 * SPEC/roadmap 6.3 — `_metrics/*.jsonl`'e ekleme/okuma. Faz 6'da sadece fix-loop'un
 * kendi ihtiyacı için minimal; Faz 8 tam ölçüm altyapısını bunun ÜZERİNE inşa eder
 * (bu dosyayı değiştirmez, genişletir).
 */
export declare function appendMetric(graphRootDir: string, file: string, record: Record<string, unknown>): void;
export declare function readMetrics(graphRootDir: string, file: string): Record<string, unknown>[];
