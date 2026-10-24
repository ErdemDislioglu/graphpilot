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

export function getChildren(graph: Graph, parentId: string): GraphNode[] {
  return graph.edges
    .filter((e) => e.type === "parent_of" && e.from === parentId)
    .map((e) => graph.nodesById.get(e.to))
    .filter((n): n is GraphNode => n !== undefined);
}

export function getDependsOn(graph: Graph, nodeId: string): GraphNode[] {
  return graph.edges
    .filter((e) => e.type === "depends_on" && e.from === nodeId)
    .map((e) => graph.nodesById.get(e.to))
    .filter((n): n is GraphNode => n !== undefined);
}

export function getReads(graph: Graph, nodeId: string): GraphNode[] {
  return graph.edges
    .filter((e) => e.type === "reads" && e.from === nodeId)
    .map((e) => graph.nodesByName.get(e.to))
    .filter((n): n is GraphNode => n !== undefined);
}

export function tasksOf(graph: Graph): GraphNode[] {
  return [...graph.nodesById.values()].filter((n) => n.kind === "task");
}

export function epicOf(graph: Graph, node: GraphNode): GraphNode | undefined {
  return node.epicId ? graph.nodesById.get(node.epicId) : undefined;
}
