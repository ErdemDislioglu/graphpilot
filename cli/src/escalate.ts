import { setFrontmatter } from "./set.js";
import { appendErrorHistoryLine } from "./errorHistory.js";
import { resolveRoute } from "./route.js";
import type { Graph } from "./graph/types.js";
import type { Config } from "./schema/index.js";

export interface EscalateResult {
  escalated: boolean;
  fromModel?: string;
  toModel?: string;
  reason?: string;
}

/**
 * SPEC/roadmap 6.5 — hata politikasının 2. adımı. Mevcut çözülen modeli bulur,
 * `config.escalation` listesinde bir sonrakine geçer, `model` alanını AÇIKÇA o değere
 * sabitler (SPEC §10: elle model her zaman routing tablosundan önce gelir — bu yüzden
 * bir sonraki `gp route` çağrısı otomatik olarak yükseltilmiş modeli döndürür).
 * Her deneme `## Hata geçmişi`'ne tek satır eklenir (SPEC §5a, `appendToSection`).
 */
export function escalateNode(graph: Graph, nodeId: string, config: Config): EscalateResult {
  const node = graph.nodesById.get(nodeId);
  if (!node || node.kind !== "task") {
    return { escalated: false, reason: `düğüm bulunamadı veya task değil: ${nodeId}` };
  }

  let currentModel: string;
  try {
    currentModel = resolveRoute(node, config).model;
  } catch (err) {
    return { escalated: false, reason: `mevcut model çözülemedi: ${String(err)}` };
  }

  const idx = (config.escalation as string[]).indexOf(currentModel);
  if (idx === -1) {
    // Model escalation listesinde yok (ör. "fable") — hangi yöne "yükseltileceği" belirsiz.
    // Tahmin etmek yerine açıkça reddet.
    return {
      escalated: false,
      fromModel: currentModel,
      reason: `"${currentModel}" escalation listesinde yok`,
    };
  }
  const nextModel = config.escalation[idx + 1];
  if (!nextModel) {
    return {
      escalated: false,
      fromModel: currentModel,
      reason: "escalation listesinin sonuna ulaşıldı",
    };
  }

  const attempts = typeof node.frontmatter.attempts === "number" ? node.frontmatter.attempts : 0;
  const setResult = setFrontmatter(graph, nodeId, {
    model: nextModel,
    attempts: String(attempts + 1),
  });
  if (!setResult.ok) {
    return { escalated: false, reason: `yazma başarısız: ${setResult.errors.join("; ")}` };
  }

  appendErrorHistoryLine(node.filePath, `${currentModel} başarısız → ${nextModel}'e yükseltildi`);

  return { escalated: true, fromModel: currentModel, toModel: nextModel };
}
