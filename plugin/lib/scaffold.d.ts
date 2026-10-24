import { type CommandRunner } from "./checks.js";
import type { Config } from "./schema/index.js";
import type { GraphNode } from "./graph/types.js";
export interface ScaffoldResult {
    /** Komut gerçekten çalıştırıldı mı (false ise `skippedReason`'a bak). */
    ran: boolean;
    skippedReason?: string;
    command?: string;
    ok?: boolean;
    output?: string;
}
/**
 * Roadmap 7.6 — "Deterministik iskelet". `type: scaffold` task'ları için, agent
 * yazmadan ÖNCE resmi iskelet aracı (ör. `npm create vite@latest`) script ile çalıştırılır;
 * agent sadece özelleştirme yapar. `config.optimizations.deterministic_scaffold` kapalıysa
 * (ablasyon) HİÇBİR ŞEY çalıştırmaz, `ran:false` + sebep döner — orkestratör bu durumda
 * agent'ı iskeletin TAMAMINI yazması için normal akışla çağırır.
 */
export declare function runScaffold(node: GraphNode, config: Config, projectRoot: string, runner?: CommandRunner): ScaffoldResult;
