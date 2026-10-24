/**
 * [[wikilink]] çıkarma — SPEC §8: hem frontmatter dizi değerlerinde (`reads`)
 * hem de body prose içinde geçebilir.
 */
const WIKILINK_RE = /\[\[([a-z][a-z0-9-]*)\]\]/g;
export function extractWikilinks(text) {
    const names = new Set();
    for (const match of text.matchAll(WIKILINK_RE)) {
        names.add(match[1]);
    }
    return [...names];
}
