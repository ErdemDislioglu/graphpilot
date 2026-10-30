import type { Graph, GraphNode } from "./graph/types.js";
export interface BlockedTask {
    node: GraphNode;
    waitingOn: GraphNode[];
}
export interface NextResult {
    /** `ready` düğümler, topolojik sıraya göre, `--limit` uygulanmış. */
    ready: GraphNode[];
    /** `ready`'nin `touches` çakışmasız paralel grupları (greedy paketleme). */
    groups: GraphNode[][];
    blocked: BlockedTask[];
    /** Tüm task'ların tam topolojik sırası (döngü yoksa). SPEC §5/2.5 "Topolojik sıralama". */
    topoOrder: string[];
    /** Döngüdeki task ID'leri (varsa) — boşsa graph bu açıdan sağlıklı. */
    cycles: string[];
}
export declare function computeNext(graph: Graph, opts?: {
    limit?: number;
}): NextResult;
export declare function touchesConflict(a: string[], b: string[]): boolean;
