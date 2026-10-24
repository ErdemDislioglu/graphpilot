import { setFrontmatter } from "../set.js";
import { appendErrorHistoryLine } from "../errorHistory.js";
import { resolveAssignment, type TeamRole } from "./assign.js";
import { recordMisTag } from "./tagging.js";
import type { Graph } from "../graph/types.js";
import type { Config } from "../schema/index.js";

export interface TeamEscalateResult {
  escalated: boolean;
  fromRole: TeamRole;
  toRole: TeamRole;
  fromModel?: string;
  toModel?: string;
  reason?: string;
}

/**
 * Roadmap 13.5 — "Döngü yakınsamazsa: Haiku junior → Sonnet junior → senior." Mevcut
 * `escalate.ts`'in model-bazlı zincirini (Faz 6.5, `config.escalation`) KULLANMAZ — ekip
 * modunda zincir `config.team.*`'tan gelir ve ROL de değişebilir (junior → senior), salt
 * model değil. `tester`'ın kendi haiku→`upgrade_to` zinciri de buradan geçer ama SENIOR'A
 * İLERLEMEZ (roadmap'in 13.5 metni sadece junior'ı belirtiyor) — tester zincirinin sonunda
 * normal `failNode`/onay akışına (Faz 12.6) düşer.
 */
export function escalateTeamNode(graph: Graph, nodeId: string, config: Config): TeamEscalateResult {
  const node = graph.nodesById.get(nodeId);
  if (!node || node.kind !== "task") {
    return {
      escalated: false,
      fromRole: "junior",
      toRole: "junior",
      reason: `düğüm bulunamadı veya task değil: ${nodeId}`,
    };
  }

  const current = resolveAssignment(node, config);

  if (current.role === "junior" && current.model === config.team.junior.low) {
    const nextModel = config.team.junior.med;
    setFrontmatter(graph, nodeId, { assignee: "junior", model: nextModel });
    appendErrorHistoryLine(
      node.filePath,
      `${nodeId} yükseltildi: junior(${current.model}) → junior(${nextModel})`,
    );
    return { escalated: true, fromRole: "junior", toRole: "junior", fromModel: current.model, toModel: nextModel };
  }

  if (current.role === "tester" && current.model === config.team.tester.model) {
    const nextModel = config.team.tester.upgrade_to;
    setFrontmatter(graph, nodeId, { assignee: "tester", model: nextModel });
    appendErrorHistoryLine(
      node.filePath,
      `${nodeId} yükseltildi: tester(${current.model}) → tester(${nextModel})`,
    );
    return { escalated: true, fromRole: "tester", toRole: "tester", fromModel: current.model, toModel: nextModel };
  }

  if (current.role === "junior") {
    setFrontmatter(graph, nodeId, { assignee: "senior" });
    recordMisTag(graph.rootDir, {
      nodeId,
      direction: "underestimated",
      reason: `junior(${current.model}) yakınsamadı`,
    });
    appendErrorHistoryLine(node.filePath, `${nodeId} yükseltildi: junior(${current.model}) → senior`);
    return {
      escalated: true,
      fromRole: "junior",
      toRole: "senior",
      fromModel: current.model,
      toModel: config.team.senior.model,
    };
  }

  return {
    escalated: false,
    fromRole: current.role,
    toRole: current.role,
    fromModel: current.model,
    reason: "escalation zincirinin sonuna ulaşıldı",
  };
}
