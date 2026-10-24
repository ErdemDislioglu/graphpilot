import { type TeamRole } from "./assign.js";
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
export declare function escalateTeamNode(graph: Graph, nodeId: string, config: Config): TeamEscalateResult;
