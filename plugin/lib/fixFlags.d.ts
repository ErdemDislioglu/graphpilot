import type { Graph } from "./graph/types.js";
export interface FlagFix {
    nodeId: string;
    field: string;
    from: unknown;
    to: unknown;
}
/**
 * SPEC/roadmap 5.3 — `gp validate --fix-flags`'in deterministik düzeltme kuralları.
 * Saf fonksiyon: ne değişeceğini HESAPLAR, yazmaz (yazma `applyFlagFixes`'in işi,
 * `setFrontmatter`'ı yeniden kullanır — kendi yazma/doğrulama mantığını tekrarlamaz).
 */
export declare function computeFlagFixes(graph: Graph): FlagFix[];
/** Hesaplanan düzeltmeleri gerçekten uygular — her biri `gp set`'in aynı yolundan geçer. */
export declare function applyFlagFixes(graph: Graph, fixes: FlagFix[]): void;
