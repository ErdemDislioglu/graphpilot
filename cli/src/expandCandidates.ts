import { getDependsOn } from "./graph/types.js";
import type { Graph } from "./graph/types.js";

export interface ExpandCandidate {
  id: string;
  kind: "epic" | "feature";
}

/**
 * SPEC/roadmap 6.1 — `/gp:run`'ın "ready yoksa açılmamış feature/epic var mı" kontrolü
 * için deterministik yanıt. Bir epic/feature "genişletilmeye hazır" sayılır:
 * `expanded: false` VE `depends_on`'ları (aynı türden) hepsi `done` (ya da boş).
 * Epic'ler feature'lardan önce gelir (deterministik sıralama) — bir epic henüz
 * genişletilmediyse altındaki feature'lar zaten yoktur.
 */
export function findExpandCandidates(graph: Graph): ExpandCandidate[] {
  const candidates: ExpandCandidate[] = [];
  for (const node of graph.nodesById.values()) {
    if (node.kind !== "epic" && node.kind !== "feature") continue;
    if (node.frontmatter.expanded !== false) continue;
    const deps = getDependsOn(graph, node.id);
    const allDepsDone = deps.every((d) => d.frontmatter.status === "done");
    if (allDepsDone) candidates.push({ id: node.id, kind: node.kind });
  }
  candidates.sort((a, b) =>
    a.kind === b.kind ? a.id.localeCompare(b.id) : a.kind === "epic" ? -1 : 1,
  );
  return candidates;
}
