import type { Graph } from "./graph/types.js";
export interface FlagFix {
    nodeId: string;
    field: string;
    from: unknown;
    to: unknown;
}
/**
 * SPEC/roadmap 5.3 — `gp validate --fix-flags`'in deterministik düzeltme kuralları.
 * Faz 13.4 eklemesi: tag kalitesini korumak için üç yeni kural (`touches`'taki
 * auth/payment/migration → security/data_model tag + en az `med` complexity; cross-epic
 * bağımlılık → `architecture` tag). Saf fonksiyon: ne değişeceğini HESAPLAR, yazmaz.
 */
export declare function computeFlagFixes(graph: Graph): FlagFix[];
/**
 * Hesaplanan düzeltmeleri gerçekten uygular. Skaler alanlar (`context_size`,
 * `complexity`) `gp set`'in yolundan geçer (`setFrontmatter`); `tags` dizi olduğu için
 * `gp set`/`setFrontmatter` ONU KOERSE ETMEZ (kasıtlı — bkz. `set.ts`'in kendi notu),
 * bu yüzden doğrudan okuma/doğrulama/atomik yazma ile uygulanır (`newNode.ts`'in
 * `depends_on`/`reads` için kullandığı yolla aynı prensip).
 */
export declare function applyFlagFixes(graph: Graph, fixes: FlagFix[]): void;
