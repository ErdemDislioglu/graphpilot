import { describe, expect, it } from "vitest";
import { computeLowComplexityBatches } from "../batching.js";
import { withTempGraph } from "../testUtils/tempGraph.js";
import { computeNext } from "../next.js";
import { ConfigSchema } from "../schema/index.js";

const CONFIG = ConfigSchema.parse({
  routing: [
    { when: { complexity: "low" }, model: "haiku" },
    { when: {}, model: "sonnet" },
  ],
  escalation: ["haiku", "sonnet"],
  max_attempts_per_model: 1,
  budgets: { default_context: 5000, max_turns: 25 },
});

const TASK = (overrides: Record<string, unknown>) => ({
  kind: "task",
  level: 3,
  summary: "s",
  type: "config",
  complexity: "low",
  risk: "low",
  context_size: "small",
  model: "auto",
  agent: "auto",
  context_budget: 1000,
  status: "pending",
  attempts: 0,
  ...overrides,
});

function frontmatter(obj: Record<string, unknown>): string {
  const lines = Object.entries(obj).map(([k, v]) => `${k}: ${JSON.stringify(v)}`);
  return `---\n${lines.join("\n")}\n---\n`;
}

describe("computeLowComplexityBatches", () => {
  it("aynı feature + complexity:low + aynı route + bütçe içinde → tek batch", () => {
    withTempGraph(
      {
        "a.md": frontmatter(TASK({ id: "E01-F01-T01", name: "a" })),
        "b.md": frontmatter(TASK({ id: "E01-F01-T02", name: "b" })),
      },
      (graph) => {
        const ready = computeNext(graph).ready;
        const { batches, singles } = computeLowComplexityBatches(ready, CONFIG);
        expect(singles).toEqual([]);
        expect(batches.length).toBe(1);
        expect(batches[0].nodes.map((n) => n.id).sort()).toEqual(["E01-F01-T01", "E01-F01-T02"]);
        expect(batches[0].model).toBe("haiku");
      },
    );
  });

  it("farklı feature'daki iki low-complexity task AYRI batch'lerde (ya da single)", () => {
    withTempGraph(
      {
        "a.md": frontmatter(TASK({ id: "E01-F01-T01", name: "a" })),
        "b.md": frontmatter(TASK({ id: "E01-F02-T01", name: "b" })),
      },
      (graph) => {
        const ready = computeNext(graph).ready;
        const { batches, singles } = computeLowComplexityBatches(ready, CONFIG);
        expect(batches).toEqual([]);
        expect(singles.length).toBe(2);
      },
    );
  });

  it("complexity: med olan task asla batch'lenmez, singles'a düşer", () => {
    withTempGraph(
      {
        "a.md": frontmatter(TASK({ id: "E01-F01-T01", name: "a", complexity: "med" })),
        "b.md": frontmatter(TASK({ id: "E01-F01-T02", name: "b" })),
      },
      (graph) => {
        const ready = computeNext(graph).ready;
        const { batches, singles } = computeLowComplexityBatches(ready, CONFIG);
        // "med" olan T01 hiç aday havuzuna girmeden singles'a düşer; T02 (low) ise
        // feature'da tek kalır (eşleşecek başka low node yok) ve o da singles'a düşer.
        expect(singles.map((n) => n.id).sort()).toEqual(["E01-F01-T01", "E01-F01-T02"]);
        expect(batches).toEqual([]);
      },
    );
  });

  it("toplam context_budget default_context'i aşarsa yeni batch açılır", () => {
    withTempGraph(
      {
        "a.md": frontmatter(TASK({ id: "E01-F01-T01", name: "a", context_budget: 3000 })),
        "b.md": frontmatter(TASK({ id: "E01-F01-T02", name: "b", context_budget: 3000 })),
      },
      (graph) => {
        // 3000 + 3000 = 6000 > default_context(5000) → aynı batch'e sığmaz
        const ready = computeNext(graph).ready;
        const { batches, singles } = computeLowComplexityBatches(ready, CONFIG);
        expect(batches).toEqual([]);
        expect(singles.length).toBe(2);
      },
    );
  });

  it("en fazla 4 düğüm bir batch'te — 5. düğüm yeni batch'e düşer", () => {
    withTempGraph(
      Object.fromEntries(
        Array.from({ length: 5 }, (_, i) => [
          `t${i}.md`,
          frontmatter(TASK({ id: `E01-F01-T0${i + 1}`, name: `t${i}`, context_budget: 100 })),
        ]),
      ),
      (graph) => {
        const ready = computeNext(graph).ready;
        const { batches, singles } = computeLowComplexityBatches(ready, CONFIG);
        expect(batches.length).toBe(1);
        expect(batches[0].nodes.length).toBe(4);
        expect(singles.length).toBe(1);
      },
    );
  });
});
