import type { NodeKind } from "../schema/common.js";
export interface GraphNode {
    id: string;
    kind: NodeKind;
    name: string;
    /** Mutlak dosya yolu. */
    filePath: string;
    /** `.graph/` köküne göre yol — hata raporlarında ve indekslerde kullanılır. */
    relPath: string;
    /** Ham frontmatter — Zod doğrulaması `validate.ts`'in işi, parser burada doğrulamaz. */
    frontmatter: Record<string, unknown>;
    /** Frontmatter'sız markdown gövdesi. */
    body: string;
    /**
     * Bu düğümün ait olduğu epic'in ID'si. Epic için kendisi, `_shared/` altındaki
     * knowledge için `null` (shared scope).
     */
    epicId: string | null;
}
export type EdgeType = "depends_on" | "reads" | "parent_of";
export interface Edge {
    from: string;
    to: string;
    type: EdgeType;
}
export interface ParseError {
    filePath: string;
    message: string;
}
export interface Graph {
    /** `.graph/` kökünün mutlak yolu. */
    rootDir: string;
    nodesById: Map<string, GraphNode>;
    nodesByName: Map<string, GraphNode>;
    edges: Edge[];
    briefBody: string | null;
    /** Ham (henüz Zod doğrulanmamış) config.yml içeriği — doğrulama `validate.ts`/`route.ts`'in işi. */
    rawConfig: unknown;
    configPath: string | null;
    parseErrors: ParseError[];
}
export declare function getChildren(graph: Graph, parentId: string): GraphNode[];
export declare function getDependsOn(graph: Graph, nodeId: string): GraphNode[];
export declare function getReads(graph: Graph, nodeId: string): GraphNode[];
export declare function tasksOf(graph: Graph): GraphNode[];
export declare function epicOf(graph: Graph, node: GraphNode): GraphNode | undefined;
