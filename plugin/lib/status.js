/** SPEC/roadmap 2.6 — `gp status`: özet sayılar. */
export function computeStatusSummary(graph) {
    const byStatus = {};
    const byKind = {};
    const running = [];
    for (const node of graph.nodesById.values()) {
        byKind[node.kind] = (byKind[node.kind] ?? 0) + 1;
        const status = node.frontmatter.status;
        if (typeof status === "string") {
            byStatus[status] = (byStatus[status] ?? 0) + 1;
            if (status === "running")
                running.push(node);
        }
    }
    return { total: graph.nodesById.size, byStatus, byKind, running };
}
