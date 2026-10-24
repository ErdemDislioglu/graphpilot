import type { AgentDefinition } from "./agentFile.js";
export interface HeadlessRunResult {
    ok: boolean;
    stdout: string;
    status: number | null;
}
export type ClaudeHeadlessSpawner = (args: string[]) => {
    stdout: string;
    status: number | null;
};
/**
 * Mod B (6.9, ADR-001) — `claude -p` çağrısının argümanlarını kurar. `--bare`
 * KULLANILMAZ (ADR-001: abonelik login'ini korumak için). Bu, Mod B'nin **ilk/temel**
 * sürümü: doğrulama döngüsü/escalation entegre DEĞİL — her düğüm için tek deneme.
 * Tam dayanıklı sürüm ileride (Faz 9 kapsamında) bu fonksiyonun üzerine inşa edilir.
 */
export declare function buildHeadlessArgs(contextMarkdown: string, agentDef: AgentDefinition, route: {
    model: string;
    max_turns: number;
}): string[];
export declare function runNodeHeadless(contextMarkdown: string, agentDef: AgentDefinition, route: {
    model: string;
    max_turns: number;
}, spawner?: ClaudeHeadlessSpawner): HeadlessRunResult;
