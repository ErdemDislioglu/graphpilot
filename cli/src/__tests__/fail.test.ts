import { readFileSync } from "node:fs";
import matter from "gray-matter";
import { describe, expect, it } from "vitest";
import { failNode } from "../fail.js";
import { withTempGraph } from "../testUtils/tempGraph.js";

const TASK = (overrides: Record<string, unknown>) => ({
  kind: "task",
  level: 3,
  summary: "s",
  type: "feature",
  complexity: "low",
  risk: "low",
  context_size: "small",
  model: "opus",
  agent: "auto",
  context_budget: 8000,
  status: "pending",
  attempts: 2,
  ...overrides,
});

function frontmatter(obj: Record<string, unknown>): string {
  const lines = Object.entries(obj).map(([k, v]) => `${k}: ${JSON.stringify(v)}`);
  return `---\n${lines.join("\n")}\n---\n## Hata geçmişi\n\n*(yok)*\n`;
}

describe("failNode", () => {
  it("status:failed yapar, Hata geçmişine yazar, doğrudan pending bağımlıları blocked işaretler", () => {
    withTempGraph(
      {
        "a.md": frontmatter(TASK({ id: "E01-F01-T01", name: "a", depends_on: [] })),
        "b.md": frontmatter(
          TASK({ id: "E01-F01-T02", name: "b", depends_on: ["E01-F01-T01"], model: "auto" }),
        ),
        "c.md": frontmatter(
          TASK({ id: "E01-F01-T03", name: "c", depends_on: [], status: "done", model: "auto" }),
        ), // T01'e bağımlı değil — etkilenmemeli
      },
      (graph, dir) => {
        const result = failNode(graph, "E01-F01-T01", "max escalation tükendi");
        expect(result.ok).toBe(true);
        expect(result.blockedDependents).toEqual(["E01-F01-T02"]);

        const a = matter(readFileSync(`${dir}/a.md`, "utf-8"));
        expect(a.data.status).toBe("failed");
        expect(a.content).toContain("max escalation tükendi");

        const b = matter(readFileSync(`${dir}/b.md`, "utf-8"));
        expect(b.data.status).toBe("blocked");

        const c = matter(readFileSync(`${dir}/c.md`, "utf-8"));
        expect(c.data.status).toBe("done"); // dokunulmadı
      },
    );
  });

  it("pending OLMAYAN bağımlıları (running/done) blocked yapmaz", () => {
    withTempGraph(
      {
        "a.md": frontmatter(TASK({ id: "E01-F01-T01", name: "a", depends_on: [] })),
        "b.md": frontmatter(
          TASK({
            id: "E01-F01-T02",
            name: "b",
            depends_on: ["E01-F01-T01"],
            status: "running",
            model: "auto",
          }),
        ),
      },
      (graph) => {
        const result = failNode(graph, "E01-F01-T01", "x");
        expect(result.blockedDependents).toEqual([]);
      },
    );
  });

  it("var olmayan düğüm için hata döner", () => {
    withTempGraph({ "a.md": frontmatter(TASK({ id: "E01-F01-T01", name: "a" })) }, (graph) => {
      const result = failNode(graph, "E99-F01-T01", "x");
      expect(result.ok).toBe(false);
    });
  });
});
