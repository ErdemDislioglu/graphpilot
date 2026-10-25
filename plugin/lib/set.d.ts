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
 *
 * Faz 14 B7 — (c) liste alanları (`depends_on`, `reads`, `touches`, `tags`, `updated_by`,
 * `source_files`, `verify`) `a,b` ya da JSON (`["a","b"]`) sözdizimiyle yazılabilir; `reads`
 * için çıplak ad `[[ad]]`'a çevrilir. (d) Yalnız değişen alanların satırları yeniden yazılır —
 * eskiden tüm frontmatter `matter.stringify` ile yeniden biçimlendiriliyordu (tırnaklı satır
 * içi → YAML blok/`>-`, şema varsayılanları ekleniyordu), sonraki elle düzenlemeler eşleşmiyordu.
 */
export declare function setFrontmatter(graph: Graph, nodeId: string, patch: Record<string, string>): SetResult;
/**
 * Frontmatter'da yalnız `values`'taki anahtarların satırlarını değiştirir (çok satırlı
 * YAML değeri ise devam satırlarıyla birlikte); olmayan anahtar sona eklenir. Değerler
 * `gp new` şablonlarıyla aynı biçimde (JSON = geçerli YAML akış sözdizimi) yazılır;
 * satırın eski değeri tırnaksız düz bir kelimeyse yeni düz kelime de tırnaksız kalır.
 */
export declare function patchFrontmatterLines(raw: string, values: Record<string, unknown>): string;
