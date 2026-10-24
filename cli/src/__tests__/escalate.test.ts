import { readFileSync } from "node:fs";
import matter from "gray-matter";
import { describe, expect, it } from "vitest";
import { escalateNode } from "../escalate.js";
import { parseGraph } from "../graph/parser.js";
import { ConfigSchema } from "../schema/index.js";
import { withTempGraph } from "../testUtils/tempGraph.js";

const TASK = (overrides: Record<string, unknown>) => ({
  id: "E01-F01-T01",
  kind: "task",
  name: "a",
  level: 3,
  summary: "s",
  type: "feature",
  complexity: "low",
  risk: "low",
  context_size: "small",
  model: "auto",
  agent: "auto",
  context_budget: 8000,
  status: "pending",
  attempts: 0,
  ...overrides,
});

function frontmatter(obj: Record<string, unknown>): string {
  const lines = Object.entries(obj).map(([k, v]) => `${k}: ${JSON.stringify(v)}`);
  return `---\n${lines.join("\n")}\n---\n## Görev\nx\n\n## Hata geçmişi\n\n*(yok)*\n`;
}

const CONFIG = ConfigSchema.parse({
  routing: [{ when: { complexity: "low" }, model: "haiku" }],
  escalation: ["haiku", "sonnet", "opus"],
  max_attempts_per_model: 1,
  budgets: { default_context: 8000, max_turns: 25 },
});

describe("escalateNode", () => {
  it("auto model'li task'ı çözülen modelden bir sonrakine yükseltir, attempts'i artırır", () => {
    withTempGraph({ "a.md": frontmatter(TASK({})) }, (graph, dir) => {
      const result = escalateNode(graph, "E01-F01-T01", CONFIG);
      expect(result).toEqual({ escalated: true, fromModel: "haiku", toModel: "sonnet" });

      const after = matter(readFileSync(`${dir}/a.md`, "utf-8"));
      expect(after.data.model).toBe("sonnet");
      expect(after.data.attempts).toBe(1);
    });
  });

  it("elle opus verilmiş (listenin sonu) bir task'ı yükseltemez", () => {
    withTempGraph({ "a.md": frontmatter(TASK({ model: "opus" })) }, (graph) => {
      const result = escalateNode(graph, "E01-F01-T01", CONFIG);
      expect(result.escalated).toBe(false);
      expect(result.reason).toContain("sonuna ulaşıldı");
    });
  });

  it("escalation listesinde olmayan bir modeli tahmin etmez, reddeder", () => {
    withTempGraph({ "a.md": frontmatter(TASK({ model: "fable" })) }, (graph) => {
      const result = escalateNode(graph, "E01-F01-T01", CONFIG);
      expect(result.escalated).toBe(false);
      expect(result.reason).toContain("listesinde yok");
    });
  });

  it("Hata geçmişine satır ekler", () => {
    withTempGraph({ "a.md": frontmatter(TASK({})) }, (graph, dir) => {
      escalateNode(graph, "E01-F01-T01", CONFIG);
      const after = matter(readFileSync(`${dir}/a.md`, "utf-8"));
      expect(after.content).toContain("haiku başarısız → sonnet'e yükseltildi");
    });
  });

  it("art arda iki escalation ikisini de Hata geçmişinde korur", () => {
    withTempGraph({ "a.md": frontmatter(TASK({})) }, (graph, dir) => {
      escalateNode(graph, "E01-F01-T01", CONFIG);
      escalateNode(parseGraph(dir), "E01-F01-T01", CONFIG);
      const after = matter(readFileSync(`${dir}/a.md`, "utf-8"));
      expect(after.data.model).toBe("opus");
      expect(after.data.attempts).toBe(2);
      expect(after.content).toContain("haiku başarısız → sonnet'e yükseltildi");
      expect(after.content).toContain("sonnet başarısız → opus'e yükseltildi");
    });
  });

  it("var olmayan düğüm için hata döner", () => {
    withTempGraph({ "a.md": frontmatter(TASK({})) }, (graph) => {
      const result = escalateNode(graph, "E99-F01-T01", CONFIG);
      expect(result.escalated).toBe(false);
    });
  });
});
