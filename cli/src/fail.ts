import { setFrontmatter } from "./set.js";
import { appendErrorHistoryLine } from "./errorHistory.js";
import type { Graph } from "./graph/types.js";

export interface FailResult {
  ok: boolean;
  blockedDependents: string[];
  error?: string;
}

/**
 * SPEC/roadmap 6.5, adım 3 — escalation tükendiğinde terminal durum.
 * Doğrudan bağımlı (pending) düğümleri `blocked` işaretler — bu salt görünürlük içindir
 * (`gp next` zaten done-olmayan bir bağımlılığı "ready" saymaz; `blocked` işareti
 * `gp status`/`gp resume`'de NEDENİ gösterir, davranışı değiştirmez).
 */
export function failNode(graph: Graph, nodeId: string, reason: string): FailResult {
  const node = graph.nodesById.get(nodeId);
  if (!node) return { ok: false, blockedDependents: [], error: `düğüm bulunamadı: ${nodeId}` };

  const setResult = setFrontmatter(graph, nodeId, { status: "failed" });
  if (!setResult.ok) {
    return {
      ok: false,
      blockedDependents: [],
      error: `yazma başarısız: ${setResult.errors.join("; ")}`,
    };
  }
  appendErrorHistoryLine(node.filePath, `${nodeId} başarısız: ${reason}`);

  const blockedDependents: string[] = [];
  for (const other of graph.nodesById.values()) {
    if (other.kind !== node.kind) continue;
    if (other.frontmatter.status !== "pending") continue;
    const dependsOn = Array.isArray(other.frontmatter.depends_on)
      ? other.frontmatter.depends_on
      : [];
    if (!dependsOn.includes(nodeId)) continue;
    const blockResult = setFrontmatter(graph, other.id, { status: "blocked" });
    if (blockResult.ok) blockedDependents.push(other.id);
  }

  return { ok: true, blockedDependents };
}
