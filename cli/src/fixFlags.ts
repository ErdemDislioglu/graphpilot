import { setFrontmatter } from "./set.js";
import { tasksOf } from "./graph/types.js";
import type { Graph } from "./graph/types.js";

export interface FlagFix {
  nodeId: string;
  field: string;
  from: unknown;
  to: unknown;
}

/**
 * SPEC/roadmap 5.3 — `gp validate --fix-flags`'in deterministik düzeltme kuralları.
 * Saf fonksiyon: ne değişeceğini HESAPLAR, yazmaz (yazma `applyFlagFixes`'in işi,
 * `setFrontmatter`'ı yeniden kullanır — kendi yazma/doğrulama mantığını tekrarlamaz).
 */
export function computeFlagFixes(graph: Graph): FlagFix[] {
  const fixes: FlagFix[] = [];

  for (const task of tasksOf(graph)) {
    const touches = Array.isArray(task.frontmatter.touches) ? task.frontmatter.touches : [];
    const contextSize = task.frontmatter.context_size;
    if (touches.length > 5 && contextSize !== "large") {
      fixes.push({ nodeId: task.id, field: "context_size", from: contextSize, to: "large" });
    }

    const type = task.frontmatter.type;
    const complexity = task.frontmatter.complexity;
    if (type === "docs" && complexity === "high") {
      fixes.push({ nodeId: task.id, field: "complexity", from: complexity, to: "med" });
    }
  }

  return fixes;
}

/** Hesaplanan düzeltmeleri gerçekten uygular — her biri `gp set`'in aynı yolundan geçer. */
export function applyFlagFixes(graph: Graph, fixes: FlagFix[]): void {
  for (const fix of fixes) {
    const result = setFrontmatter(graph, fix.nodeId, { [fix.field]: String(fix.to) });
    if (!result.ok) {
      throw new Error(
        `flag düzeltmesi uygulanamadı (${fix.nodeId}.${fix.field}): ${result.errors.join("; ")}`,
      );
    }
  }
}
