import type { Graph, GraphNode } from "./graph/types.js";
export declare function hashFileContent(content: string): string;
export type FileHashReader = (absPath: string) => string | null;
/** Gerçek dosya okuyucu — dosya yoksa `null` (hata fırlatmaz, 9.5 "eksik dosya" toleransı). */
export declare const defaultFileHashReader: FileHashReader;
export type SourceFileStatus = {
    path: string;
    state: "ok";
} | {
    path: string;
    state: "changed";
    previousHash: string;
    currentHash: string;
} | {
    path: string;
    state: "never-hashed";
    currentHash: string;
} | {
    path: string;
    state: "missing";
};
export interface KnowledgeSyncReport {
    nodeId: string;
    files: SourceFileStatus[];
}
/**
 * Roadmap 9.3 — "kullanıcı kodu elle değiştirirse ilgili bilgi düğümlerini 'şüpheli'
 * işaretleme (dosya hash'i ile source_files karşılaştırması)". Saf fonksiyon: dosya
 * okuma `FileHashReader` üzerinden enjekte edilir (gerçek fs'e bağlı değil, test edilebilir).
 */
export declare function computeKnowledgeSyncReport(node: GraphNode, projectRoot: string, readHash?: FileHashReader): KnowledgeSyncReport;
export type SetSourceHashesResult = {
    ok: true;
} | {
    ok: false;
    errors: string[];
};
/**
 * `gp sync --update-hashes` — `source_hashes` bir OBJE alanı, `gp set`'in string-koerse
 * eden `setFrontmatter`'ı (CLI patch'leri hep string taşır) buna uygun değil; bu yüzden
 * ayrı, objeyi doğrudan yazan bir fonksiyon. Aynı güvenlik: yazmadan önce şemadan geçer.
 */
export declare function setKnowledgeSourceHashes(node: GraphNode, hashes: Record<string, string>): SetSourceHashesResult;
/** Graph'taki TÜM knowledge düğümleri için rapor — `gp sync`'in asıl işi. */
export declare function computeAllKnowledgeSyncReports(graph: Graph, projectRoot: string, readHash?: FileHashReader): KnowledgeSyncReport[];
