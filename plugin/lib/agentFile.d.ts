export interface AgentDefinition {
    tools: string;
    systemPrompt: string;
}
/**
 * Mod B (6.9) için: `plugin/agents/<ad>.md`'yi okur. Mod A'da bu dosya Claude Code'un
 * kendisi tarafından yüklenir; Mod B headless olduğu için GP bunu kendisi okuyup
 * `claude -p --append-system-prompt`/`--allowedTools`'a geçirmek zorunda.
 */
export declare function readAgentDefinition(filePath: string): AgentDefinition;
