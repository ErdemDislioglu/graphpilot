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

describe("computeFlagFixes — Faz 13.4 tag kalitesi kuralları", () => {
  it("touches içinde 'auth' geçen yol → tags:['security'] + complexity:med önerir", () => {
    withTempGraph(
      {
        "a.md": frontmatter(
          TASK({
            id: "E01-F01-T01",
            name: "a",
            touches: ["src/auth/login.ts"],
            complexity: "low",
            tags: [],
          }),
        ),
      },
      (graph) => {
        const fixes = computeFlagFixes(graph);
        expect(fixes).toEqual([
          { nodeId: "E01-F01-T01", field: "tags", from: [], to: ["security"] },
          { nodeId: "E01-F01-T01", field: "complexity", from: "low", to: "med" },
        ]);
      },
    );
  });

  it("touches içinde 'migration' geçen yol → tags:['data_model'] önerir", () => {
    withTempGraph(
      {
        "a.md": frontmatter(
          TASK({ id: "E01-F01-T01", name: "a", touches: ["db/migrations/001.sql"], tags: [] }),
        ),
      },
      (graph) => {
        const fixes = computeFlagFixes(graph);
        expect(fixes[0]).toEqual({
          nodeId: "E01-F01-T01",
          field: "tags",
          from: [],
          to: ["data_model"],
        });
      },
    );
  });

  it("zaten doğru tag varsa tekrar önerilmez (idempotent)", () => {
    withTempGraph(
      {
        "a.md": frontmatter(
          TASK({
            id: "E01-F01-T01",
            name: "a",
            touches: ["src/auth/login.ts"],
            complexity: "med",
            tags: ["security"],
          }),
        ),
      },
      (graph) => {
        expect(computeFlagFixes(graph)).toEqual([]);
      },
    );
  });

  it("başka epic'teki bir görev buna bağımlıysa → tags:['architecture'] önerir", () => {
    withTempGraph(
      {
        "E01-x/epic.md": frontmatter({
          id: "E01",
          kind: "epic",
          name: "E01-x",
          summary: "s",
          status: "pending",
          expanded: true,
        }),
        "E01-x/tasks/F01-T01-a.md": frontmatter(
          TASK({ id: "E01-F01-T01", name: "F01-T01-a", tags: [] }),
        ),
        "E02-y/epic.md": frontmatter({
          id: "E02",
          kind: "epic",
          name: "E02-y",
          summary: "s",
          status: "pending",
          expanded: true,
        }),
        "E02-y/tasks/F01-T01-b.md": frontmatter(
          TASK({ id: "E02-F01-T01", name: "F01-T01-b", depends_on: ["E01-F01-T01"], tags: [] }),
        ),
      },
      (graph) => {
        const fixes = computeFlagFixes(graph);
        expect(fixes).toContainEqual({
          nodeId: "E01-F01-T01",
          field: "tags",
          from: [],
          to: ["architecture"],
        });
        // Bağımlı olan (E02-F01-T01) kendisi cross-epic hedefi DEĞİL, kaynağı — ona
        // architecture tag'i önerilmez.
        expect(fixes.find((f) => f.nodeId === "E02-F01-T01")).toBeUndefined();
      },
    );
  });
});

describe("applyFlagFixes — Faz 13.4 (tags dizi alanı)", () => {
  it("tags fix'ini gerçekten diske yazar (gp set'in string-koersiyonu BYPASS edilir)", () => {
    withTempGraph(
      {
        "a.md": frontmatter(
          TASK({ id: "E01-F01-T01", name: "a", touches: ["src/auth/x.ts"], tags: [] }),
        ),
      },
      (graph, dir) => {
        const fixes = computeFlagFixes(graph);
        applyFlagFixes(graph, fixes);
        const after = matter(readFileSync(`${dir}/a.md`, "utf-8"));
        expect(after.data.tags).toEqual(["security"]);
        expect(after.data.complexity).toBe("med");
        expect(computeFlagFixes(parseGraph(dir))).toEqual([]); // idempotent
      },
    );
  });
});
