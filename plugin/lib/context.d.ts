import type { Config } from "./schema/index.js";
import type { Graph } from "./graph/types.js";
export interface ContextPartSummary {
    label: string;
    tokens: number;
}
export interface ContextResult {
    markdown: string;
    tokenEstimate: number;
    budget: number;
    overBudget: boolean;
    /** Token payına göre büyükten küçüğe — bütçe aşılırsa hangi parça büyük, hemen görülür. */
    parts: ContextPartSummary[];
}
/**
 * SPEC/roadmap 2.8 — EN KRİTİK komut. Paket **sabit sırada** kurulur (prompt caching
 * buna bağlı, bu sıra ASLA değiştirilmemeli):
 *   1. brief.md (sabit)
 *   2. epic _index.md (yarı sabit — `gp index` diskte yoksa burada bellekte üretilir)
 *   3. `reads` listesindeki bilgi düğümleri, frontmatter'daki sırayla
 *   4. Doğrudan `depends_on` düğümlerinin SADECE Handoff bölümü, frontmatter'daki sırayla
 *   5. Düğümün kendisi (değişken kısım en sonda)
 * Geçişli bağımlılıklar hiç dahil edilmez — `getDependsOn`/`getReads` zaten tek adım.
 */
export declare function buildContext(graph: Graph, nodeId: string, config: Config): ContextResult;
/** `gp context <id>`: paketi üretir VE `.graph/_runtime/<id>.context.md`'ye yazar. */
export declare function writeContextFile(graph: Graph, nodeId: string, config: Config): ContextResult;
