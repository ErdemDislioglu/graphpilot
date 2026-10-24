import { spawnSync } from "node:child_process";
import { extractSection } from "./markdown.js";
const defaultSpawner = (args) => {
    const result = spawnSync("claude", args, { encoding: "utf-8" });
    return { stdout: result.stdout ?? "", status: result.status };
};
/** Katman 2'nin yapılandırılmış çıktı şeması — `gp check`'in `--json-schema` argümanı. */
export const ACCEPTANCE_CHECK_SCHEMA = {
    type: "object",
    required: ["results"],
    properties: {
        results: {
            type: "array",
            items: {
                type: "object",
                required: ["kriter", "durum", "not"],
                properties: {
                    kriter: { type: "string" },
                    durum: { type: "string", enum: ["ok", "eksik"] },
                    not: { type: "string" },
                },
            },
        },
    },
};
/**
 * SPEC/roadmap 6.3 Katman 2 — [ADR-008](../../../docs/decisions.md#adr-008).
 * Girdi SADECE kabul kriterleri + diff (tüm bağlam değil). `claude -p --json-schema`
 * çağırır; `structured_output` yoksa (model reddi vb.) **`success: false`** döner —
 * çağıran taraf bunu "eksik" sayıp düzeltme turuna girmeli, sessizce "ok" saymamalı.
 */
export function runAcceptanceCheck(criteria, diff, opts = {}) {
    const spawner = opts.spawner ?? defaultSpawner;
    const prompt = [
        "Aşağıdaki kabul kriterlerini diff'e karşı tek tek işaretle.",
        "Her kriter için { kriter, durum: ok|eksik, not } ver. Belirsizsen 'eksik' de.",
        "",
        "## Kabul kriterleri",
        criteria,
        "",
        "## Diff",
        diff,
    ].join("\n");
    const args = [
        "-p",
        prompt,
        "--output-format",
        "json",
        "--json-schema",
        JSON.stringify(ACCEPTANCE_CHECK_SCHEMA),
        ...(opts.model ? ["--model", opts.model] : []),
    ];
    let raw;
    try {
        const { stdout } = spawner(args);
        raw = JSON.parse(stdout);
    }
    catch (err) {
        return {
            success: false,
            results: [],
            error: `claude -p çağrısı/parse başarısız: ${String(err)}`,
        };
    }
    const structuredOutput = raw?.structured_output;
    if (!structuredOutput ||
        typeof structuredOutput !== "object" ||
        !Array.isArray(structuredOutput.results)) {
        return {
            success: false,
            results: [],
            error: "structured_output alanı yok (kontrol başarısız)",
        };
    }
    return {
        success: true,
        results: structuredOutput.results,
    };
}
/** `gp check <id>` komutunun üst düzey akışı: görevden kabul kriterlerini okur. */
export function extractAcceptanceCriteria(task) {
    return extractSection(task.body, "Kabul kriterleri");
}
