/**
 * SPEC/roadmap 2.9 — `gp repomap`. Basit regex tabanlı sembol çıkarma (AST değil);
 * "hedef projenin dili" taranır, GP'nin kendi stack'i değil.
 *
 * **Soyut arayüz** (roadmap'in isteği): `SymbolExtractor`'ları değiştirerek ileride
 * tree-sitter'a (Faz 10.8) ya da Graphify gibi bir dış araca (Faz 0 rakip notu) geçmek,
 * `buildRepoMap`'in kendisine dokunmadan mümkün olmalı.
 */
export interface SymbolExtractor {
    extensions: string[];
    extract(content: string): string[];
}
export declare const DEFAULT_EXTRACTORS: SymbolExtractor[];
export declare function buildRepoMap(projectRoot: string, extractors?: SymbolExtractor[]): {
    body: string;
    fileCount: number;
};
/** `gp repomap`: `.graph/_shared/knowledge/repo-map.md`'yi bir knowledge düğümü olarak yazar. */
export declare function writeRepoMap(projectRoot: string, graphRootDir: string): {
    path: string;
    fileCount: number;
};
