import type { NodeKind, Status } from "./schema/common.js";
import type { Graph, GraphNode } from "./graph/types.js";
export interface StatusSummary {
    total: number;
    byStatus: Partial<Record<Status, number>>;
    byKind: Partial<Record<NodeKind, number>>;
    running: GraphNode[];
}
/** SPEC/roadmap 2.6 — `gp status`: özet sayılar. */
export declare function computeStatusSummary(graph: Graph): StatusSummary;
