import type { GraphNode } from "./graph/types.js";
export interface AcceptanceCriterionResult {
    kriter: string;
    durum: "ok" | "eksik";
    not: string;
}
export interface AcceptanceCheckResult {
    /** false ise `results` boş ve güvenilmez — "ok" SAYMA (ADR-008'in uyarısı). */
    success: boolean;
    results: AcceptanceCriterionResult[];
    error?: string;
}
/** `claude` CLI'ını çağıran fonksiyon — testte enjekte edilir, gerçek yürütmede `spawnSync`. */
export type ClaudeSpawner = (args: string[]) => {
    stdout: string;
    status: number | null;
};
/** Katman 2'nin yapılandırılmış çıktı şeması — `gp check`'in `--json-schema` argümanı. */
export declare const ACCEPTANCE_CHECK_SCHEMA: {
    readonly type: "object";
    readonly required: readonly ["results"];
    readonly properties: {
        readonly results: {
            readonly type: "array";
            readonly items: {
                readonly type: "object";
                readonly required: readonly ["kriter", "durum", "not"];
                readonly properties: {
                    readonly kriter: {
                        readonly type: "string";
                    };
                    readonly durum: {
                        readonly type: "string";
                        readonly enum: readonly ["ok", "eksik"];
                    };
                    readonly not: {
                        readonly type: "string";
                    };
                };
            };
        };
    };
};
/**
 * SPEC/roadmap 6.3 Katman 2 — [ADR-008](../../../docs/decisions.md#adr-008).
 * Girdi SADECE kabul kriterleri + diff (tüm bağlam değil). `claude -p --json-schema`
 * çağırır; `structured_output` yoksa (model reddi vb.) **`success: false`** döner —
 * çağıran taraf bunu "eksik" sayıp düzeltme turuna girmeli, sessizce "ok" saymamalı.
 */
export declare function runAcceptanceCheck(criteria: string, diff: string, opts?: {
    model?: string;
    spawner?: ClaudeSpawner;
}): AcceptanceCheckResult;
/** `gp check <id>` komutunun üst düzey akışı: görevden kabul kriterlerini okur. */
export declare function extractAcceptanceCriteria(task: GraphNode): string | null;
