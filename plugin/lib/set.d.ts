import type { Graph } from "./graph/types.js";
export type SetResult = {
    ok: true;
} | {
    ok: false;
    errors: string[];
};
/**
 * `gp set <id> status=done attempts=1` — roadmap/SPEC 2.6.
 *
 * `patch` CLI'dan her zaman STRING değer taşır (`"done"`, `"1"`); mevcut frontmatter
 * alanının tipine göre (`number`/`boolean`/`string`) koerse edilir. Birleştirilmiş
 * frontmatter, yazmadan ÖNCE doğru Zod şemasından geçirilir — geçersizse hiçbir şey
 * yazılmaz ve hata listesi döner (bozuk graph hiç diske düşmez).
 *
 * Atomik yazma (`atomicWrite.ts`); gövde dokunulmadan korunur. İlgili indeksi yeniden
 * üretmek `cli.ts`'in işi (bu fonksiyon dosya mutasyonuyla sınırlı, tek sorumluluk).
 */
export declare function setFrontmatter(graph: Graph, nodeId: string, patch: Record<string, string>): SetResult;
