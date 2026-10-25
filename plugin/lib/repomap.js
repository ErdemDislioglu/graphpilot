import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import fg from "fast-glob";
import { writeFileAtomic } from "./atomicWrite.js";
export const DEFAULT_EXTRACTORS = [
    {
        extensions: [".ts", ".tsx", ".js", ".jsx"],
        extract: (content) => matchAll(content, /^export\s+(?:default\s+)?(?:async\s+)?(?:function|class|const|let|var|interface|type|enum)\s+(\w+)/gm),
    },
    {
        extensions: [".py"],
        extract: (content) => [
            ...matchAll(content, /^(?:async\s+)?def\s+(\w+)/gm),
            ...matchAll(content, /^class\s+(\w+)/gm),
        ],
    },
    {
        extensions: [".go"],
        extract: (content) => [
            ...matchAll(content, /^func\s+(?:\([^)]*\)\s*)?(\w+)/gm),
            ...matchAll(content, /^type\s+(\w+)/gm),
        ],
    },
    {
        extensions: [".java"],
        extract: (content) => matchAll(content, /\b(?:public|protected)\s+(?:static\s+final\s+|final\s+static\s+|static\s+|final\s+)?(?:class|interface|enum)\s+(\w+)/g),
    },
];
const DEFAULT_IGNORE = ["**/node_modules/**", "**/.git/**", "**/dist/**", "**/.graph/_runtime/**"];
function matchAll(content, re) {
    return [...content.matchAll(re)].map((m) => m[1]);
}
/**
 * `.gitignore`'u (varsa) basit satır→glob dönüşümüyle okur. Negation (`!desen`) ve
 * karmaşık gitignore sözdizimi desteklenmez — bilinen bir basitleştirme (roadmap
 * "`.gitignore` ve `node_modules` vb. hariç" diyor, tam parser istemiyor).
 */
function readGitignorePatterns(projectRoot) {
    const gitignorePath = join(projectRoot, ".gitignore");
    if (!existsSync(gitignorePath))
        return [];
    return readFileSync(gitignorePath, "utf-8")
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && !l.startsWith("#") && !l.startsWith("!"))
        .flatMap((l) => {
        const clean = l.replace(/^\/+/, "").replace(/\/+$/, "");
        return [`**/${clean}`, `**/${clean}/**`];
    });
}
export function buildRepoMap(projectRoot, extractors = DEFAULT_EXTRACTORS) {
    const allExtensions = extractors.flatMap((e) => e.extensions);
    const pattern = `**/*{${allExtensions.join(",")}}`;
    const ignore = [...DEFAULT_IGNORE, ...readGitignorePatterns(projectRoot)];
    const files = fg
        .sync(pattern, { cwd: projectRoot, ignore, dot: false })
        .sort((a, b) => a.localeCompare(b));
    const lines = [];
    for (const relPath of files) {
        const extractor = extractors.find((e) => e.extensions.some((ext) => relPath.endsWith(ext)));
        if (!extractor)
            continue;
        const content = readFileSync(join(projectRoot, relPath), "utf-8");
        const symbols = extractor.extract(content);
        // Faz 14 B9 — sembolsüz dosyalar (ör. tüm `test/*.test.js`) eskiden atlanıyordu; artık
        // yalnız yol olarak listelenir (dosyanın var olduğu bilgisi de haritanın parçası).
        // fast-glob sonuçları her platformda zaten posix (forward-slash) yol döndürür.
        lines.push(symbols.length === 0 ? relPath : `${relPath}: ${symbols.join(", ")}`);
    }
    return { body: lines.join("\n") + (lines.length > 0 ? "\n" : ""), fileCount: lines.length };
}
/** `gp repomap`: `.graph/_shared/knowledge/repo-map.md`'yi bir knowledge düğümü olarak yazar. */
export function writeRepoMap(projectRoot, graphRootDir) {
    const { body, fileCount } = buildRepoMap(projectRoot);
    const outPath = join(graphRootDir, "_shared", "knowledge", "repo-map.md");
    const frontmatter = [
        "---",
        "id: repo-map",
        "kind: knowledge",
        "name: repo-map",
        'summary: "Proje kodunun sıkıştırılmış dosya/sembol haritası (gp repomap)"',
        "scope: shared",
        "updated_by: []",
        "source_files: []",
        "---",
        "",
        "## Özet",
        "",
        `Otomatik üretildi — \`gp repomap\`. ${fileCount} dosya, tek satır/dosya.`,
        "",
        "## Arayüz",
        "",
        body,
    ].join("\n");
    writeFileAtomic(outPath, frontmatter);
    return { path: outPath, fileCount };
}
