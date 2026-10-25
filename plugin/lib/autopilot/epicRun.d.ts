import type { GitRunner } from "../check.js";
import { type ExpandCandidate } from "../expandCandidates.js";
import { type ClaudeHeadlessSpawner } from "../runModeB.js";
import type { Config } from "../schema/index.js";
import type { Graph, GraphNode } from "../graph/types.js";
import type { Lang } from "./messages.js";
/** `autopilot.scope` ("all" | "epic:E03" | "until:E05") bir düğümü kapsıyor mu. */
export declare function inScope(node: GraphNode, scope: string): boolean;
/** Kapsamdaki ilk genişletme adayı (feature'lar önce — `findExpandCandidates` sırası). */
export declare function expandCandidateInScope(graph: Graph, scope: string): ExpandCandidate | undefined;
/** Kapsamdaki tüm epic'ler bitti mi (genişletilmemiş epic/feature "bitmedi" sayılır). */
export declare function scopeDone(graph: Graph, scope: string): boolean;
export type RunTarget = {
    ok: true;
    epic: GraphNode;
} | {
    ok: false;
    error: string;
};
/** `/run e03` argümanını doğrular: var olan, bitmemiş bir epic olmalı. */
export declare function parseRunTarget(graph: Graph, arg: string, lang: Lang): RunTarget;
/** `/epics` cevabı: her epic için durum işareti, bitmiş/toplam görev ve özet. */
export declare function epicsListText(graph: Graph, lang: Lang): string;
export declare function helpText(lang: Lang): string;
/** `/gp:run`'ın §Genişletme adımının headless karşılığı: planner'a verilen görev mesajı. */
export declare function expansionPrompt(candidate: ExpandCandidate, config: Config, pluginRoot: string): string;
export interface ExpandResult {
    ok: boolean;
    error?: string;
}
/**
 * Bir adayı headless planner ile genişletir. `agentsDir` plugin'in `agents/` dizinidir;
 * planner `gp`'yi bulsun diye plugin kökü hem prompt'ta hem `CLAUDE_PLUGIN_ROOT`'ta verilir.
 */
export declare function expandHeadless(candidate: ExpandCandidate, opts: {
    agentsDir: string;
    config: Config;
    spawner?: ClaudeHeadlessSpawner;
}): ExpandResult;
/** `feature/E03-el-cizimi-tasarim-sistemi` — epic'in `name`'i zaten ID ile başlıyorsa tekrar etmez. */
export declare function epicBranchName(epic: GraphNode): string;
/** Değişiklik varsa hepsini tek commit'e koyar; commit atıldıysa `true`. */
export declare function commitAll(projectRoot: string, message: string, git?: GitRunner): boolean;
/** Dala geçer, yoksa mevcut HEAD'den açar. Commit'lenmemiş değişiklikler yeni dala taşınır. */
export declare function checkoutBranch(projectRoot: string, branch: string, git?: GitRunner): boolean;
/** Geçerli dalı `origin`'e push'lar (upstream'i de ayarlar). */
export declare function pushCurrentBranch(projectRoot: string, git?: GitRunner): boolean;
