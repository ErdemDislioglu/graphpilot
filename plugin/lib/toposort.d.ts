/**
 * Genel topolojik sıralama + döngü tespiti. `validate.ts` (depends_on döngüsü) ve
 * `next.ts` (hazır düğüm hesaplama, tam sıra raporu) tarafından paylaşılır.
 *
 * Kahn algoritması: her adımda giren-derecesi 0 olan düğümleri alır. Sona kadar
 * tüketilemeyen düğümler varsa bunlar bir döngünün parçasıdır.
 */
export interface TopoResult {
    /** Bağımlılık sırasına uygun tam sıralama. Döngü varsa döngüdeki düğümler dahil değildir. */
    order: string[];
    /** Kahn algoritmasının tüketemediği düğümler — en az bir döngünün parçası. */
    cycleNodes: string[];
}
export declare function topoSort(nodeIds: string[], edges: Array<[string, string]>): TopoResult;
