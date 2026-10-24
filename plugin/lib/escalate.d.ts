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
export declare function escalateNode(graph: Graph, nodeId: string, config: Config): EscalateResult;
