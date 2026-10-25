import { readFileSync } from "node:fs";
import matter from "gray-matter";
import { EpicFrontmatterSchema, FeatureFrontmatterSchema, TaskFrontmatterSchema, KnowledgeFrontmatterSchema, } from "./schema/index.js";
import { writeFileAtomic } from "./atomicWrite.js";
const SCHEMA_BY_KIND = {
    epic: EpicFrontmatterSchema,
    feature: FeatureFrontmatterSchema,
    task: TaskFrontmatterSchema,
    knowledge: KnowledgeFrontmatterSchema,
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
export function setFrontmatter(graph, nodeId, patch) {
    const node = graph.nodesById.get(nodeId);
    if (!node)
        return { ok: false, errors: [`düğüm bulunamadı: ${nodeId}`] };
    const raw = readFileSync(node.filePath, "utf-8");
    const parsed = matter(raw);
    const merged = { ...parsed.data };
    const values = {};
    for (const [key, rawValue] of Object.entries(patch)) {
        values[key] = coerce(key, merged[key], rawValue);
        merged[key] = values[key];
    }
    const schema = SCHEMA_BY_KIND[node.kind];
    const result = schema.safeParse(merged);
    if (!result.success) {
        return {
            ok: false,
            errors: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
        };
    }
    writeFileAtomic(node.filePath, patchFrontmatterLines(raw, values));
    return { ok: true };
}
const LIST_FIELDS = new Set([
    "depends_on",
    "reads",
    "touches",
    "tags",
    "updated_by",
    "source_files",
    "verify",
]);
function coerce(key, existing, rawValue) {
    if (LIST_FIELDS.has(key) || Array.isArray(existing))
        return parseList(key, rawValue);
    if (typeof existing === "number") {
        const n = Number(rawValue);
        return Number.isNaN(n) ? rawValue : n;
    }
    if (typeof existing === "boolean") {
        if (rawValue === "true")
            return true;
        if (rawValue === "false")
            return false;
        return rawValue;
    }
    return rawValue;
}
function parseList(key, rawValue) {
    const trimmed = rawValue.trim();
    let items;
    if (trimmed.startsWith("[")) {
        try {
            items = JSON.parse(trimmed);
        }
        catch {
            return rawValue; // şema "expected array" hatasını verir — dosya yazılmaz
        }
    }
    else {
        items = trimmed === "" ? [] : trimmed.split(",").map((v) => v.trim()).filter(Boolean);
    }
    if (key === "reads" && Array.isArray(items)) {
        return items.map((v) => (typeof v === "string" && !v.startsWith("[[") ? `[[${v}]]` : v));
    }
    return items;
}
/**
 * Frontmatter'da yalnız `values`'taki anahtarların satırlarını değiştirir (çok satırlı
 * YAML değeri ise devam satırlarıyla birlikte); olmayan anahtar sona eklenir. Değerler
 * `gp new` şablonlarıyla aynı biçimde (JSON = geçerli YAML akış sözdizimi) yazılır;
 * satırın eski değeri tırnaksız düz bir kelimeyse yeni düz kelime de tırnaksız kalır.
 */
export function patchFrontmatterLines(raw, values) {
    const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw);
    if (!match)
        throw new Error("frontmatter bulunamadı");
    const lines = match[1].split("\n");
    for (const [key, value] of Object.entries(values)) {
        const start = lines.findIndex((l) => l.startsWith(`${key}:`));
        const oldValue = start === -1 ? "" : lines[start].slice(key.length + 1).trim();
        const plain = typeof value === "string" && isPlainWord(value) && isPlainWord(oldValue);
        const line = `${key}: ${plain ? String(value) : JSON.stringify(value)}`;
        if (start === -1) {
            lines.push(line);
            continue;
        }
        let end = start + 1;
        while (end < lines.length && /^(\s|-(\s|$))/.test(lines[end]))
            end++;
        lines.splice(start, end - start, line);
    }
    const patched = lines.join("\n");
    return raw.replace(match[1], () => patched);
}
/** YAML'da tırnaksız yazıldığında yine aynı string olarak okunan kelime (true/null/sayı değil). */
function isPlainWord(v) {
    return /^[a-z_][a-z0-9_-]*$/i.test(v) && !/^(true|false|yes|no|on|off|null|~)$/i.test(v);
}
