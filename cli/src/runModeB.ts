import { spawnSync } from "node:child_process";
import type { AgentDefinition } from "./agentFile.js";

export interface HeadlessRunResult {
  ok: boolean;
  stdout: string;
  status: number | null;
}

export type ClaudeHeadlessSpawner = (args: string[]) => { stdout: string; status: number | null };

const defaultSpawner: ClaudeHeadlessSpawner = (args) => {
  const result = spawnSync("claude", args, { encoding: "utf-8" });
  return { stdout: result.stdout ?? "", status: result.status };
};

/**
 * Mod B (6.9, ADR-001) — `claude -p` çağrısının argümanlarını kurar. `--bare`
 * KULLANILMAZ (ADR-001: abonelik login'ini korumak için). Bu, Mod B'nin **ilk/temel**
 * sürümü: doğrulama döngüsü/escalation entegre DEĞİL — her düğüm için tek deneme.
 * Tam dayanıklı sürüm ileride (Faz 9 kapsamında) bu fonksiyonun üzerine inşa edilir.
 */
export function buildHeadlessArgs(
  contextMarkdown: string,
  agentDef: AgentDefinition,
  route: { model: string; max_turns: number },
): string[] {
  return [
    "-p",
    contextMarkdown,
    "--model",
    route.model,
    "--max-turns",
    String(route.max_turns),
    "--append-system-prompt",
    agentDef.systemPrompt,
    "--allowedTools",
    agentDef.tools,
    "--output-format",
    "json",
  ];
}

export function runNodeHeadless(
  contextMarkdown: string,
  agentDef: AgentDefinition,
  route: { model: string; max_turns: number },
  spawner: ClaudeHeadlessSpawner = defaultSpawner,
): HeadlessRunResult {
  const args = buildHeadlessArgs(contextMarkdown, agentDef, route);
  const { stdout, status } = spawner(args);
  return { ok: status === 0, stdout, status };
}
