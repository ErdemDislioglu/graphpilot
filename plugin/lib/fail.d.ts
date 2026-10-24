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
export declare function failNode(graph: Graph, nodeId: string, reason: string): FailResult;
