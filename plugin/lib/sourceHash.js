import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import matter from "gray-matter";
import { writeFileAtomic } from "./atomicWrite.js";
import { KnowledgeFrontmatterSchema } from "./schema/index.js";
export function hashFileContent(content) {
    return createHash("sha256").update(content).digest("hex");
}
/** Gerçek dosya okuyucu — dosya yoksa `null` (hata fırlatmaz, 9.5 "eksik dosya" toleransı). */
export const defaultFileHashReader = (absPath) => {
    if (!existsSync(absPath))
        return null;
    try {
        return hashFileContent(readFileSync(absPath, "utf-8"));
    }
    catch {
        return null;
    }
};
/**
 * Roadmap 9.3 — "kullanıcı kodu elle değiştirirse ilgili bilgi düğümlerini 'şüpheli'
 * işaretleme (dosya hash'i ile source_files karşılaştırması)". Saf fonksiyon: dosya
 * okuma `FileHashReader` üzerinden enjekte edilir (gerçek fs'e bağlı değil, test edilebilir).
 */
export function computeKnowledgeSyncReport(node, projectRoot, readHash = defaultFileHashReader) {
    const sourceFiles = Array.isArray(node.frontmatter.source_files)
        ? node.frontmatter.source_files.filter((f) => typeof f === "string")
        : [];
    const storedHashes = node.frontmatter.source_hashes && typeof node.frontmatter.source_hashes === "object"
        ? node.frontmatter.source_hashes
        : {};
    const files = sourceFiles.map((relPath) => {
        const currentHash = readHash(join(projectRoot, relPath));
        if (currentHash === null)
            return { path: relPath, state: "missing" };
        const previousHash = storedHashes[relPath];
        if (previousHash === undefined)
            return { path: relPath, state: "never-hashed", currentHash };
        if (previousHash !== currentHash) {
            return { path: relPath, state: "changed", previousHash, currentHash };
        }
        return { path: relPath, state: "ok" };
    });
    return { nodeId: node.id, files };
}
/**
 * `gp sync --update-hashes` — `source_hashes` bir OBJE alanı, `gp set`'in string-koerse
 * eden `setFrontmatter`'ı (CLI patch'leri hep string taşır) buna uygun değil; bu yüzden
 * ayrı, objeyi doğrudan yazan bir fonksiyon. Aynı güvenlik: yazmadan önce şemadan geçer.
 */
export function setKnowledgeSourceHashes(node, hashes) {
    const raw = readFileSync(node.filePath, "utf-8");
    const parsed = matter(raw);
    const merged = { ...parsed.data, source_hashes: hashes };
    const result = KnowledgeFrontmatterSchema.safeParse(merged);
    if (!result.success) {
        return { ok: false, errors: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
    }
    writeFileAtomic(node.filePath, matter.stringify(parsed.content, result.data));
    return { ok: true };
}
/** Graph'taki TÜM knowledge düğümleri için rapor — `gp sync`'in asıl işi. */
export function computeAllKnowledgeSyncReports(graph, projectRoot, readHash = defaultFileHashReader) {
    return [...graph.nodesById.values()]
        .filter((n) => n.kind === "knowledge")
        .map((n) => computeKnowledgeSyncReport(n, projectRoot, readHash))
        .filter((r) => r.files.length > 0);
}
