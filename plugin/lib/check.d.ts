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
export type GitDiffResult = {
    ok: true;
    diff: string;
} | {
    ok: false;
    reason: string;
};
/** `git` CLI'ını çağıran fonksiyon — testte enjekte edilir; stdout/stderr yakalanır, ekrana basılmaz. */
export type GitRunner = (args: string[], cwd: string) => {
    stdout: string;
    status: number | null;
};
/**
 * Faz 14 B1 — Katman 2'nin girdisi olan `git diff HEAD`'i okur. Eskiden doğrudan
 * `execSync` çağrılıyordu: git deposu dışında git'in usage metni stderr'e akıyor,
 * `--json` istense bile stdout'a hiçbir şey yazılmıyordu → skill sonucu "eksik yok"tan
 * ayıramıyordu (ADR-008). Artık diff alınamazsa nedeni döner; çağıran `success:false` yazar.
 */
export declare function readGitDiff(projectRoot: string, runner?: GitRunner): GitDiffResult;
/** `gp check <id>` komutunun üst düzey akışı: görevden kabul kriterlerini okur. */
export declare function extractAcceptanceCriteria(task: GraphNode): string | null;
