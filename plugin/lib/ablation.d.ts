import type { Config } from "./schema/index.js";
import type { Graph } from "./graph/types.js";
export interface AblationRow {
    technique: keyof typeof TECHNIQUE_LABELS;
    /** "ölçüldü" = gerçek sayısal fark var; "yapısal" = mekanizma doğrulandı ama token
     * farkı gerçek tekrarlı çağrı/ablasyon koşusu gerektirir; "n/a" = örnek senaryoda
     * ölçülecek bir şey yok (ör. scaffold tipi task yok). */
    status: "ölçüldü" | "yapısal" | "n/a";
    detail: string;
}
declare const TECHNIQUE_LABELS: {
    readonly cache_friendly_order: "Cache dostu sıralama (7.1)";
    readonly repo_map: "Repo haritası (7.2)";
    readonly log_trimming: "Log/çıktı kırpma (7.3)";
    readonly tool_restriction: "Araç kısıtlama (7.4)";
    readonly batch_low_nodes: "Küçük düğüm birleştirme (7.5)";
    readonly deterministic_scaffold: "Deterministik iskelet (7.6)";
    readonly turn_limits: "Tur limiti / döngü tespiti (7.7)";
};
/**
 * Roadmap 7.10 — "Ablasyon tablosu". **Dürüst sınır** (Faz 0/6'daki aynı kısıt): gerçek
 * bir çok-koşu LLM benchmark'ı (Faz 8'in işi) burada YOKTUR — onaysız gerçek API
 * kullanımı harcardı. Bunun yerine her tekniğin GERÇEK kodu, GERÇEK örnek graph'a
 * (`docs/examples/bookstore`) ve GERÇEK agent tanımlarına karşı çalıştırılıp ölçülebilen
 * her şey ölçülür; sadece "tekrarlı çağrıda cache isabet oranı" gibi doğası gereği
 * gerçek birden fazla API çağrısı gerektiren metrikler "yapısal" (mekanizma doğru
 * kurulu, sayısal fark Faz 8.1'i bekliyor) olarak işaretlenir.
 */
export declare function renderAblationMarkdown(rows: AblationRow[]): string;
/**
 * Her tekniği GERÇEK veriyle (örnek graph, gerçek agent dosyaları, gerçek repo taraması)
 * tek tek ölçer. `sampleTaskId` — sıralama/determinizm demosunda kullanılacak, en az bir
 * `reads`/`depends_on`'u olan bir task ID'si (bookstore'da `E01-F01-T02`).
 */
export declare function computeAblationRows(graph: Graph, config: Config, sampleTaskId: string, agentsDir: string, repoMapProjectRoot: string): AblationRow[];
export {};
