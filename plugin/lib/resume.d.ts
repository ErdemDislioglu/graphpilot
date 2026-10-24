import type { Graph } from "./graph/types.js";
/**
 * SPEC/roadmap 2.10b — `gp resume`: kesinti sonrası devam için ~500 token'lık özet.
 * Her liste en fazla `MAX_ITEMS` öğeyle sınırlanır (karakter bazlı kırpma değil —
 * markdown'ı ortadan bölüp bozmamak için liste uzunluğu sınırlanır). Ayrıntılar Faz 9.1'de.
 */
export declare function buildResumeSummary(graph: Graph): string;
