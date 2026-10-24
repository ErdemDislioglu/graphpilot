import type { NodeKind, Status } from "./schema/common.js";
import type { Graph, GraphNode } from "./graph/types.js";

export interface StatusSummary {
  total: number;
  byStatus: Partial<Record<Status, number>>;
  byKind: Partial<Record<NodeKind, number>>;
  running: GraphNode[];
}

/** SPEC/roadmap 2.6 — `gp status`: özet sayılar. */
export function computeStatusSummary(graph: Graph): StatusSummary {
  const byStatus: Partial<Record<Status, number>> = {};
  const byKind: Partial<Record<NodeKind, number>> = {};
  const running: GraphNode[] = [];

  for (const node of graph.nodesById.values()) {
    byKind[node.kind] = (byKind[node.kind] ?? 0) + 1;
    const status = node.frontmatter.status;
    if (typeof status === "string") {
      byStatus[status as Status] = (byStatus[status as Status] ?? 0) + 1;
      if (status === "running") running.push(node);
    }
  }

  return { total: graph.nodesById.size, byStatus, byKind, running };
}
