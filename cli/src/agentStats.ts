import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import matter from "gray-matter";
import { estimateTokens } from "./tokens.js";

export interface AgentStat {
  name: string;
  /** `tools`/`disallowedTools` frontmatter alanlarının tahmini token'ı. */
  toolDefTokens: number;
  /** Tüm dosyanın (frontmatter + sistem promptu) tahmini token'ı. */
  totalTokens: number;
  tools: string;
  disallowedTools?: string;
}

/**
 * Roadmap 7.4 — "Ölç: tool tanım token'ı". Her agent `.md`'sinin tool listesinin ve
 * tüm dosyanın tahmini token boyutunu hesaplar — Faz 8 ablasyonunda "tool_restriction"
 * açık/kapalı (yani dar `tools` listesi vs. hiç kısıtlama olmasaydı ne olurdu) karşılaştırması
 * için ham veri. Gerçek bir "kısıtlamasız" agent varyantı YOKTUR (ADR-002: Agent tool
 * çağrı anında sistem promptu/araç listesi override edilemiyor) — bu fonksiyon sadece
 * MEVCUT tanımların boyutunu ölçer, hipotetik karşılaştırma yapmaz.
 */
export function computeAgentStats(agentsDir: string): AgentStat[] {
  return readdirSync(agentsDir)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((file) => {
      const raw = readFileSync(join(agentsDir, file), "utf-8");
      const parsed = matter(raw);
      const tools = typeof parsed.data.tools === "string" ? parsed.data.tools : "";
      const disallowedTools =
        typeof parsed.data.disallowedTools === "string" ? parsed.data.disallowedTools : undefined;
      return {
        name: file.replace(/\.md$/, ""),
        toolDefTokens: estimateTokens(tools + (disallowedTools ?? "")),
        totalTokens: estimateTokens(raw),
        tools,
        ...(disallowedTools ? { disallowedTools } : {}),
      };
    });
}
