import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseGraph } from "../graph/parser.js";
import { computeNext } from "../next.js";
import { withTempGraph } from "../testUtils/tempGraph.js";

const here = dirname(fileURLToPath(import.meta.url));
const bookstoreGraph = join(here, "../../../docs/examples/bookstore/.graph");

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
  context_budget: 8000,
  status: "pending",
  attempts: 0,
  ...overrides,
});

function frontmatter(obj: Record<string, unknown>): string {
  const lines = Object.entries(obj).map(([k, v]) => `${k}: ${JSON.stringify(v)}`);
  return `---\n${lines.join("\n")}\n---\n`;
}

describe("computeNext — gerçek bookstore graph (T01 done, diğerleri pending)", () => {
  const graph = parseGraph(bookstoreGraph);
  const result = computeNext(graph);

  it("sadece T02 ve F02-T01 hazır (depends_on'ları done olan tek pending task'lar)", () => {
    expect(result.ready.map((n) => n.id).sort()).toEqual(["E01-F01-T02", "E01-F02-T01"]);
  });

  it("T03 blocked: T02'yi (done değil) bekliyor", () => {
    const blocked = result.blocked.find((b) => b.node.id === "E01-F01-T03");
    expect(blocked?.waitingOn.map((n) => n.id)).toEqual(["E01-F01-T02"]);
  });

  it("F02-T02 blocked: F02-T01'i bekliyor", () => {
    const blocked = result.blocked.find((b) => b.node.id === "E01-F02-T02");
    expect(blocked?.waitingOn.map((n) => n.id)).toEqual(["E01-F02-T01"]);
  });

  it("döngü yok, topoOrder tüm 5 task'ı içeriyor", () => {
    expect(result.cycles).toEqual([]);
    expect(result.topoOrder.length).toBe(5);
  });

  it("T02 (src/catalog/**) ve F02-T01 (src/cart/types.ts) touches çakışmıyor → tek grupta", () => {
    expect(result.groups.length).toBe(1);
    expect(result.groups[0].map((n) => n.id).sort()).toEqual(["E01-F01-T02", "E01-F02-T01"]);
  });

  it("--limit uygulanır", () => {
    const limited = computeNext(graph, { limit: 1 });
    expect(limited.ready.length).toBe(1);
  });
});

describe("computeNext — touches çakışması paralel gruplamayı böler", () => {
  it("aynı dizine dokunan iki ready task ayrı gruplara düşer", () => {
    withTempGraph(
      {
        "a.md": frontmatter(TASK({ id: "E01-F01-T01", name: "a", touches: ["src/x/**"] })),
        "b.md": frontmatter(TASK({ id: "E01-F01-T02", name: "b", touches: ["src/x/file.ts"] })),
      },
      (graph) => {
        const result = computeNext(graph);
        expect(result.ready.length).toBe(2);
        expect(result.groups.length).toBe(2);
      },
    );
  });

  it("farklı dizinlere dokunan iki ready task aynı grupta kalır", () => {
    withTempGraph(
      {
        "a.md": frontmatter(TASK({ id: "E01-F01-T01", name: "a", touches: ["src/x/**"] })),
        "b.md": frontmatter(TASK({ id: "E01-F01-T02", name: "b", touches: ["src/y/**"] })),
      },
      (graph) => {
        const result = computeNext(graph);
        expect(result.groups.length).toBe(1);
      },
    );
  });
});

describe("computeNext — döngü varsa cycles'ta raporlanır, ready'ye hiçbiri girmez", () => {
  it("A<->B döngüsü", () => {
    withTempGraph(
      {
        "a.md": frontmatter(TASK({ id: "E01-F01-T01", name: "a", depends_on: ["E01-F01-T02"] })),
        "b.md": frontmatter(TASK({ id: "E01-F01-T02", name: "b", depends_on: ["E01-F01-T01"] })),
      },
      (graph) => {
        const result = computeNext(graph);
        expect(result.cycles.sort()).toEqual(["E01-F01-T01", "E01-F01-T02"]);
        expect(result.ready).toEqual([]);
      },
    );
  });
});
