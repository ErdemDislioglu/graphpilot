import matter from "gray-matter";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { applyFlagFixes, computeFlagFixes } from "../fixFlags.js";
import { parseGraph } from "../graph/parser.js";
import { withTempGraph } from "../testUtils/tempGraph.js";

const TASK = (overrides: Record<string, unknown>) => ({
  kind: "task",
  level: 3,
  summary: "s",
  type: "feature",
  complexity: "med",
  risk: "low",
  context_size: "small",
  model: "auto",
  agent: "auto",
  touches: [],
  context_budget: 8000,
  status: "pending",
  attempts: 0,
  ...overrides,
});

function frontmatter(obj: Record<string, unknown>): string {
  const lines = Object.entries(obj).map(([k, v]) => `${k}: ${JSON.stringify(v)}`);
  return `---\n${lines.join("\n")}\n---\n## Görev\nx\n`;
}

describe("computeFlagFixes", () => {
  it("touches > 5 dosya → context_size: large önerir", () => {
    withTempGraph(
      {
        "a.md": frontmatter(
          TASK({
            id: "E01-F01-T01",
            name: "a",
            touches: ["a.ts", "b.ts", "c.ts", "d.ts", "e.ts", "f.ts"],
            context_size: "small",
          }),
        ),
      },
      (graph) => {
        const fixes = computeFlagFixes(graph);
        expect(fixes).toEqual([
          { nodeId: "E01-F01-T01", field: "context_size", from: "small", to: "large" },
        ]);
      },
    );
  });

  it("type:docs + complexity:high → complexity: med önerir", () => {
    withTempGraph(
      {
        "a.md": frontmatter(
          TASK({ id: "E01-F01-T01", name: "a", type: "docs", complexity: "high" }),
        ),
      },
      (graph) => {
        const fixes = computeFlagFixes(graph);
        expect(fixes).toEqual([
          { nodeId: "E01-F01-T01", field: "complexity", from: "high", to: "med" },
        ]);
      },
    );
  });

  it("zaten düzeltilmiş (context_size:large) tekrar önerilmez", () => {
    withTempGraph(
      {
        "a.md": frontmatter(
          TASK({
            id: "E01-F01-T01",
            name: "a",
            touches: ["a", "b", "c", "d", "e", "f"],
            context_size: "large",
          }),
        ),
      },
      (graph) => {
        expect(computeFlagFixes(graph)).toEqual([]);
      },
    );
  });

  it("uygunsuz görev için boş dizi döner", () => {
    withTempGraph({ "a.md": frontmatter(TASK({ id: "E01-F01-T01", name: "a" })) }, (graph) => {
      expect(computeFlagFixes(graph)).toEqual([]);
    });
  });
});

describe("applyFlagFixes", () => {
  it("hesaplanan düzeltmeleri gerçekten diske yazar", () => {
    withTempGraph(
      {
        "a.md": frontmatter(
          TASK({
            id: "E01-F01-T01",
            name: "a",
            touches: ["a", "b", "c", "d", "e", "f"],
            context_size: "small",
          }),
        ),
      },
      (graph, dir) => {
        const fixes = computeFlagFixes(graph);
        applyFlagFixes(graph, fixes);
        const after = matter(readFileSync(`${dir}/a.md`, "utf-8"));
        expect(after.data.context_size).toBe("large");
        // İkinci parse'ta artık düzeltme önerilmemeli (idempotent).
        expect(computeFlagFixes(parseGraph(dir))).toEqual([]);
      },
    );
  });
});
