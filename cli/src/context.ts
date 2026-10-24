import { join } from "node:path";
import { extractSection } from "./markdown.js";
import { estimateTokens } from "./tokens.js";
import { writeFileAtomic } from "./atomicWrite.js";
import { generateEpicIndex } from "./indexGen.js";
import { getDependsOn, getReads } from "./graph/types.js";
import type { Config } from "./schema/index.js";
import type { Graph } from "./graph/types.js";

export interface ContextPartSummary {
  label: string;
  tokens: number;
}

export interface ContextResult {
  markdown: string;
  tokenEstimate: number;
  budget: number;
  overBudget: boolean;
  /** Token payına göre büyükten küçüğe — bütçe aşılırsa hangi parça büyük, hemen görülür. */
  parts: ContextPartSummary[];
}

/**
 * SPEC/roadmap 2.8 — EN KRİTİK komut. Paket **sabit sırada** kurulur (prompt caching
 * buna bağlı, bu sıra ASLA değiştirilmemeli):
 *   1. brief.md (sabit)
 *   2. epic _index.md (yarı sabit — `gp index` diskte yoksa burada bellekte üretilir)
 *   3. `reads` listesindeki bilgi düğümleri, frontmatter'daki sırayla
 *   4. Doğrudan `depends_on` düğümlerinin SADECE Handoff bölümü, frontmatter'daki sırayla
 *   5. Düğümün kendisi (değişken kısım en sonda)
 * Geçişli bağımlılıklar hiç dahil edilmez — `getDependsOn`/`getReads` zaten tek adım.
 */
export function buildContext(graph: Graph, nodeId: string, config: Config): ContextResult {
  const node = graph.nodesById.get(nodeId);
  if (!node) throw new Error(`düğüm bulunamadı: ${nodeId}`);

  const parts: { label: string; content: string }[] = [];

  if (graph.briefBody !== null) {
    parts.push({ label: "brief", content: graph.briefBody });
  }

  if (node.epicId) {
    parts.push({ label: "epic-index", content: generateEpicIndex(graph, node.epicId) });
  }

  for (const target of getReads(graph, node.id)) {
    parts.push({ label: `read:${target.name}`, content: target.body });
  }

  for (const dep of getDependsOn(graph, node.id)) {
    const handoff = extractSection(dep.body, "Handoff");
    parts.push({
      label: `handoff:${dep.id}`,
      content: handoff ?? "*(Handoff bulunamadı)*",
    });
  }

  parts.push({ label: "node", content: renderNode(node) });

  // Faz 7.1/7.10 — ablasyon anahtarı: `cache_friendly_order` kapatılırsa SADECE ölçüm
  // karşılaştırması için sabit sıra bozulur (alfabetik). Üretimde HER ZAMAN açık kalmalı;
  // bu dal yalnızca Faz 8 ablasyon koşusunda `false` görür.
  const orderedParts =
    config.optimizations?.cache_friendly_order === false
      ? [...parts].sort((a, b) => a.label.localeCompare(b.label))
      : parts;

  const markdown =
    orderedParts.map((p) => `## ${p.label}\n\n${p.content}`).join("\n\n---\n\n") + "\n";
  const tokenEstimate = estimateTokens(markdown);
  const budget =
    typeof node.frontmatter.context_budget === "number"
      ? node.frontmatter.context_budget
      : config.budgets.default_context;

  const partSummaries = parts
    .map((p) => ({ label: p.label, tokens: estimateTokens(p.content) }))
    .sort((a, b) => b.tokens - a.tokens);

  return {
    markdown,
    tokenEstimate,
    budget,
    overBudget: tokenEstimate > budget,
    parts: partSummaries,
  };
}

/** `gp context <id>`: paketi üretir VE `.graph/_runtime/<id>.context.md`'ye yazar. */
export function writeContextFile(graph: Graph, nodeId: string, config: Config): ContextResult {
  const result = buildContext(graph, nodeId, config);
  const outPath = join(graph.rootDir, "_runtime", `${nodeId}.context.md`);
  writeFileAtomic(outPath, result.markdown);
  return result;
}

function renderNode(node: { frontmatter: Record<string, unknown>; body: string }): string {
  const fmLines = Object.entries(node.frontmatter).map(([k, v]) => `${k}: ${JSON.stringify(v)}`);
  return `\`\`\`yaml\n${fmLines.join("\n")}\n\`\`\`\n\n${node.body}`;
}
