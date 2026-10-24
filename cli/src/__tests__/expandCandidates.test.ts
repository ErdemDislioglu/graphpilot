import { describe, expect, it } from "vitest";
import { findExpandCandidates } from "../expandCandidates.js";
import { withTempGraph } from "../testUtils/tempGraph.js";

const EPIC = (overrides: Record<string, unknown>) => ({
  kind: "epic",
  summary: "s",
  status: "pending",
  expanded: false,
  depends_on: [],
  ...overrides,
});
const FEATURE = (overrides: Record<string, unknown>) => ({
  kind: "feature",
  summary: "s",
  status: "pending",
  expanded: false,
  depends_on: [],
  ...overrides,
});

function frontmatter(obj: Record<string, unknown>): string {
  const lines = Object.entries(obj).map(([k, v]) => `${k}: ${JSON.stringify(v)}`);
  return `---\n${lines.join("\n")}\n---\n`;
}

describe("findExpandCandidates", () => {
  it("depends_on'u olmayan, expanded:false bir epic'i aday sayar", () => {
    withTempGraph({ "e.md": frontmatter(EPIC({ id: "E01", name: "E01-x" })) }, (graph) => {
      expect(findExpandCandidates(graph)).toEqual([{ id: "E01", kind: "epic" }]);
    });
  });

  it("depends_on'u DONE olmayan bir epic'i aday saymaz (henüz hazır değil)", () => {
    withTempGraph(
      {
        "e1.md": frontmatter(EPIC({ id: "E01", name: "E01-x", status: "running" })),
        "e2.md": frontmatter(EPIC({ id: "E02", name: "E02-y", depends_on: ["E01"] })),
      },
      (graph) => {
        const result = findExpandCandidates(graph);
        expect(result.map((c) => c.id)).toEqual(["E01"]); // E02 henüz hazır değil
      },
    );
  });

  it("depends_on'u DONE olan bir epic aday olur", () => {
    withTempGraph(
      {
        "e1.md": frontmatter(EPIC({ id: "E01", name: "E01-x", expanded: true, status: "done" })),
        "e2.md": frontmatter(EPIC({ id: "E02", name: "E02-y", depends_on: ["E01"] })),
      },
      (graph) => {
        expect(findExpandCandidates(graph)).toEqual([{ id: "E02", kind: "epic" }]);
      },
    );
  });

  it("expanded:true olan hiç aday sayılmaz", () => {
    withTempGraph(
      { "e.md": frontmatter(EPIC({ id: "E01", name: "E01-x", expanded: true })) },
      (graph) => {
        expect(findExpandCandidates(graph)).toEqual([]);
      },
    );
  });

  it("epic'ler feature'lardan önce sıralanır, her grup kendi içinde ID'ye göre", () => {
    withTempGraph(
      {
        "f.md": frontmatter(FEATURE({ id: "E01-F01", name: "F01-x" })),
        "e.md": frontmatter(EPIC({ id: "E02", name: "E02-y" })),
      },
      (graph) => {
        const result = findExpandCandidates(graph);
        expect(result).toEqual([
          { id: "E02", kind: "epic" },
          { id: "E01-F01", kind: "feature" },
        ]);
      },
    );
  });
});
