import { readFileSync } from "node:fs";
import matter from "gray-matter";

export interface AgentDefinition {
  tools: string;
  systemPrompt: string;
}

/**
 * Mod B (6.9) için: `plugin/agents/<ad>.md`'yi okur. Mod A'da bu dosya Claude Code'un
 * kendisi tarafından yüklenir; Mod B headless olduğu için GP bunu kendisi okuyup
 * `claude -p --append-system-prompt`/`--allowedTools`'a geçirmek zorunda.
 */
export function readAgentDefinition(filePath: string): AgentDefinition {
  const parsed = matter(readFileSync(filePath, "utf-8"));
  const tools = typeof parsed.data.tools === "string" ? parsed.data.tools : "Read,Edit,Write,Bash";
  return { tools, systemPrompt: parsed.content.trim() };
}
