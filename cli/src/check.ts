import { spawnSync } from "node:child_process";
import { extractSection } from "./markdown.js";
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
export type ClaudeSpawner = (args: string[]) => { stdout: string; status: number | null };

const defaultSpawner: ClaudeSpawner = (args) => {
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
} as const;

/**
 * SPEC/roadmap 6.3 Katman 2 — [ADR-008](../../../docs/decisions.md#adr-008).
 * Girdi SADECE kabul kriterleri + diff (tüm bağlam değil). `claude -p --json-schema`
 * çağırır; `structured_output` yoksa (model reddi vb.) **`success: false`** döner —
 * çağıran taraf bunu "eksik" sayıp düzeltme turuna girmeli, sessizce "ok" saymamalı.
 */
export function runAcceptanceCheck(
  criteria: string,
  diff: string,
  opts: { model?: string; spawner?: ClaudeSpawner } = {},
): AcceptanceCheckResult {
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

  let raw: unknown;
  try {
    const { stdout } = spawner(args);
    raw = JSON.parse(stdout);
  } catch (err) {
    return {
      success: false,
      results: [],
      error: `claude -p çağrısı/parse başarısız: ${String(err)}`,
    };
  }

  const structuredOutput = (raw as { structured_output?: unknown } | null)?.structured_output;
  if (
    !structuredOutput ||
    typeof structuredOutput !== "object" ||
    !Array.isArray((structuredOutput as { results?: unknown }).results)
  ) {
    return {
      success: false,
      results: [],
      error: "structured_output alanı yok (kontrol başarısız)",
    };
  }

  return {
    success: true,
    results: (structuredOutput as { results: AcceptanceCriterionResult[] }).results,
  };
}

/** `gp check <id>` komutunun üst düzey akışı: görevden kabul kriterlerini okur. */
export function extractAcceptanceCriteria(task: GraphNode): string | null {
  return extractSection(task.body, "Kabul kriterleri");
}
