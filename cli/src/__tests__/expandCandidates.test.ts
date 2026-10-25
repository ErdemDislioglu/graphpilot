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
const TASK = (overrides: Record<string, unknown>) => ({
  kind: "task",
  level: 3,
  summary: "s",
  type: "feature",
  complexity: "low",
  risk: "low",
  context_size: "small",
  model: "auto",
  agent: "auto",
  depends_on: [],
  context_budget: 8000,
  status: "pending",
  attempts: 0,
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

  it("2026-10-25 bug fix: bağımlılığın KENDİ status alanı 'done' olsa bile (gerçekte hiç olmaz) bu YETERLİ SAYILMAZ — altındaki task'lara bakılır", () => {
    withTempGraph(
      {
        // Epic'in KENDİ status'u 'done' yazılmış (gerçek bir graph'ta bu ASLA olmaz —
        // hiçbir mekanizma bunu yazmaz) ama altında HİÇ task yok (ya da bitmemiş) —
        // bu durumda E02 aday OLMAMALI, çünkü gerçek sinyal "status" değil "task'lar bitti mi".
        "e1.md": frontmatter(EPIC({ id: "E01", name: "E01-x", expanded: true, status: "done" })),
        "e2.md": frontmatter(EPIC({ id: "E02", name: "E02-y", depends_on: ["E01"] })),
      },
      (graph) => {
        expect(findExpandCandidates(graph)).toEqual([]);
      },
    );
  });

  it("depends_on'u olan epic'in TÜM task'ları gerçekten done ise aday olur (gerçek sinyal)", () => {
    withTempGraph(
      {
        "e1.md": frontmatter(EPIC({ id: "E01", name: "E01-x", expanded: true })),
        "e1-f1.md": frontmatter(FEATURE({ id: "E01-F01", name: "F01-x", expanded: true })),
        "e1-f1-t1.md": frontmatter(TASK({ id: "E01-F01-T01", name: "F01-T01-x", status: "done" })),
        "e2.md": frontmatter(EPIC({ id: "E02", name: "E02-y", depends_on: ["E01"] })),
      },
      (graph) => {
        expect(findExpandCandidates(graph)).toEqual([{ id: "E02", kind: "epic" }]);
      },
    );
  });

  it("2026-10-25 bug fix (gerçek bir test projesinde bulundu): bir feature'ın tüm task'ları done olunca ona depends_on ile bağlı KARDEŞ feature aday olur", () => {
    withTempGraph(
      {
        "e1.md": frontmatter(EPIC({ id: "E01", name: "E01-x", expanded: true })),
        "e1-f1.md": frontmatter(FEATURE({ id: "E01-F01", name: "F01-x", expanded: true })),
        "e1-f1-t1.md": frontmatter(TASK({ id: "E01-F01-T01", name: "F01-T01-x", status: "done" })),
        // E01-F02'nin kendisi hâlâ status:pending (gerçek graph'ta hep öyle kalır) —
        // ama F01'in TÜM task'ları bitti, bu yüzden F02 aday OLMALI.
        "e1-f2.md": frontmatter(FEATURE({ id: "E01-F02", name: "F02-y", depends_on: ["E01-F01"] })),
      },
      (graph) => {
        expect(findExpandCandidates(graph)).toEqual([{ id: "E01-F02", kind: "feature" }]);
      },
    );
  });

  it("feature'ın task'ları HENÜZ bitmediyse kardeş feature aday olmaz", () => {
    withTempGraph(
      {
        "e1.md": frontmatter(EPIC({ id: "E01", name: "E01-x", expanded: true })),
        "e1-f1.md": frontmatter(FEATURE({ id: "E01-F01", name: "F01-x", expanded: true })),
        "e1-f1-t1.md": frontmatter(TASK({ id: "E01-F01-T01", name: "F01-T01-x", status: "pending" })),
        "e1-f2.md": frontmatter(FEATURE({ id: "E01-F02", name: "F02-y", depends_on: ["E01-F01"] })),
      },
      (graph) => {
        expect(findExpandCandidates(graph)).toEqual([]);
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

  it("Faz 14 B3: feature'lar epic'lerden önce sıralanır (başlanmış epic önce biter), her grup kendi içinde ID'ye göre", () => {
    withTempGraph(
      {
        "f2.md": frontmatter(FEATURE({ id: "E01-F02", name: "F02-x" })),
        "f.md": frontmatter(FEATURE({ id: "E01-F01", name: "F01-x" })),
        "e3.md": frontmatter(EPIC({ id: "E03", name: "E03-z" })),
        "e.md": frontmatter(EPIC({ id: "E02", name: "E02-y" })),
      },
      (graph) => {
        const result = findExpandCandidates(graph);
        expect(result).toEqual([
          { id: "E01-F01", kind: "feature" },
          { id: "E01-F02", kind: "feature" },
          { id: "E02", kind: "epic" },
          { id: "E03", kind: "epic" },
        ]);
      },
    );
  });

  it("Faz 14 B3 (pilot): E02-F02 genişletilmemişken E02'ye bağlı E03 aday olmaz; aday E02-F02'dir", () => {
    withTempGraph(
      {
        "e2.md": frontmatter(EPIC({ id: "E02", name: "E02-x", expanded: true })),
        "e2-f1.md": frontmatter(FEATURE({ id: "E02-F01", name: "F01-x", expanded: true })),
        "e2-f1-t1.md": frontmatter(TASK({ id: "E02-F01-T01", name: "F01-T01-x", status: "done" })),
        "e2-f2.md": frontmatter(FEATURE({ id: "E02-F02", name: "F02-x", depends_on: ["E02-F01"] })),
        "e3.md": frontmatter(EPIC({ id: "E03", name: "E03-y", depends_on: ["E02"] })),
      },
      (graph) => {
        expect(findExpandCandidates(graph)).toEqual([{ id: "E02-F02", kind: "feature" }]);
      },
    );
  });
});
