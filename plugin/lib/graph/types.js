export function getChildren(graph, parentId) {
    return graph.edges
        .filter((e) => e.type === "parent_of" && e.from === parentId)
        .map((e) => graph.nodesById.get(e.to))
        .filter((n) => n !== undefined);
}
export function getDependsOn(graph, nodeId) {
    return graph.edges
        .filter((e) => e.type === "depends_on" && e.from === nodeId)
        .map((e) => graph.nodesById.get(e.to))
        .filter((n) => n !== undefined);
}
export function getReads(graph, nodeId) {
    return graph.edges
        .filter((e) => e.type === "reads" && e.from === nodeId)
        .map((e) => graph.nodesByName.get(e.to))
        .filter((n) => n !== undefined);
}
export function tasksOf(graph) {
    return [...graph.nodesById.values()].filter((n) => n.kind === "task");
}
export function epicOf(graph, node) {
    return node.epicId ? graph.nodesById.get(node.epicId) : undefined;
}
