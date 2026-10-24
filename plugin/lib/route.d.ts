import type { Config } from "./schema/index.js";
import type { GraphNode } from "./graph/types.js";
export interface RouteResult {
    model: string;
    agent: string;
    review: boolean;
    budget: number;
    max_turns: number;
}
/**
 * SPEC §10 — routing çözücü. Sadece `kind: task` düğümler için anlamlıdır.
 *
 * Öncelik: düğümde `model` elle verilmişse (≠ "auto") o kullanılır, routing tablosuna
 * hiç bakılmaz. Aksi halde `config.routing` kuralları sırayla denenir, ilk eşleşen kazanır.
 * Hiçbir kural eşleşmezse hata fırlatır (sessiz varsayılan yok — "model düşünür, script
 * çalışır" ilkesi: yapılandırma boşluğu gürültülü başarısız olmalı).
 */
export declare function resolveRoute(node: GraphNode, config: Config): RouteResult;
