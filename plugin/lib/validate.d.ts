import type { Graph } from "./graph/types.js";
export interface ValidationIssue {
    file?: string;
    nodeId?: string;
    severity: "error" | "warning";
    message: string;
}
/**
 * SPEC'teki tüm kuralları kontrol eder (§3-§10). Sırasıyla:
 * parseErrors → frontmatter şeması → config.yml şeması → kırık link → kenar tip kontrolü
 * (depends_on sadece aynı kind, reads sadece knowledge) → döngü → token sınırları.
 */
export declare function validateGraph(graph: Graph): ValidationIssue[];
