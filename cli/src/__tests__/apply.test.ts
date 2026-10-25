import { readFileSync } from "node:fs";
import matter from "gray-matter";
import { describe, expect, it } from "vitest";
import { applyPlan } from "../apply.js";
import { parseGraph } from "../graph/parser.js";
import { validateGraph } from "../validate.js";
import { withTempGraph } from "../testUtils/tempGraph.js";

const FULL_PLAN = {
  nodes: [
    { ref: "e", kind: "epic", slug: "notes", summary: "Not API'si", body: { Amaç: "CRUD.", Kapsam: "REST." } },
    { kind: "knowledge", slug: "notes-store", parent: "e", summary: "Depo arayüzü" },
    { ref: "f1", kind: "feature", slug: "store", parent: "e", summary: "Depo" },
    { ref: "f2", kind: "feature", slug: "http", parent: "e", summary: "HTTP", depends_on: ["f1"] },
    {
      ref: "t1",
      kind: "task",
      slug: "store-impl",
      parent: "f1",
      summary: "JSON dosya deposu",
      type: "feature",
      complexity: "low",
      risk: "low",
      touches: ["src/store.js", "test/store.test.js"],
      reads: ["notes-store"],
      verify: ["node --test test/store.test.js"],
      body: { Görev: "Depoyu yaz.", "Kabul kriterleri": "- atomik yazma" },
    },
    {
      kind: "task",
      slug: "http-impl",
      parent: "f2",
      summary: "HTTP uç noktaları",
      complexity: "med",
      tags: ["integration"],
      depends_on: ["t1"],
      reads: ["[[notes-store]]"],
    },
  ],
  expanded: ["e", "f1", "f2"],
};

describe("applyPlan — Faz 14 O3", () => {
  it("epic→feature→task + knowledge'ı ref'lerle yazar; gövde, alanlar, expanded doğru; graph geçerli", () => {
    withTempGraph({}, (_graph, dir) => {
      const result = applyPlan(dir, FULL_PLAN);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.created.map((n) => n.id)).toEqual([
        "E01",
        "notes-store",
        "E01-F01",
        "E01-F02",
        "E01-F01-T01",
        "E01-F02-T01",
      ]);
      expect(result.expanded).toEqual(["E01", "E01-F01", "E01-F02"]);

      const graph = parseGraph(dir);
      expect(validateGraph(graph).filter((i) => i.severity === "error")).toEqual([]);
      const t1 = graph.nodesById.get("E01-F01-T01")!;
      expect(t1.frontmatter).toMatchObject({
        complexity: "low",
        reads: ["[[notes-store]]"],
        verify: ["node --test test/store.test.js"],
      });
      expect(t1.body).toContain("## Görev\n\nDepoyu yaz.");
      expect(graph.nodesById.get("E01-F02-T01")!.frontmatter).toMatchObject({
        depends_on: ["E01-F01-T01"],
        tags: ["integration"],
      });
      expect(graph.nodesById.get("E01-F02")!.frontmatter.depends_on).toEqual(["E01-F01"]);
      expect(graph.nodesById.get("E01")!.frontmatter.expanded).toBe(true);
      expect(matter(readFileSync(graph.nodesById.get("E01")!.filePath, "utf-8")).content).toContain(
        "## Amaç\n\nCRUD.",
      );
    });
  });

  it("çözülemeyen ref / yanlış tür / task'a özel alan → hiçbir dosya yazılmaz", () => {
    withTempGraph({}, (_graph, dir) => {
      const result = applyPlan(dir, {
        nodes: [
          { ref: "e", kind: "epic", slug: "x", summary: "s", complexity: "low" },
          { kind: "task", slug: "t", parent: "e", summary: "s" },
          { kind: "feature", slug: "f", parent: "yok", summary: "s", depends_on: ["e"] },
        ],
      });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.errors).toEqual([
        "plan.nodes.0 (e): 'complexity' yalnız task için",
        "plan.nodes.1: parent bulunamadı veya feature değil: e",
        "plan.nodes.2: parent bulunamadı veya epic değil: yok",
        "plan.nodes.2: depends_on hedefi bulunamadı veya feature değil: e",
      ]);
      expect(parseGraph(dir).nodesById.size).toBe(0);
    });
  });

  it("şema hatası (uzun summary, geçersiz enum) yazmadan raporlanır", () => {
    withTempGraph({}, (_graph, dir) => {
      const result = applyPlan(dir, {
        nodes: [{ kind: "epic", slug: "x", summary: "a".repeat(101) }],
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors[0]).toMatch(/^plan\.nodes\.0\.summary/);
      expect(parseGraph(dir).nodesById.size).toBe(0);
    });
  });

  it("yazma sırasında hata olursa oluşturulanlar geri alınır", () => {
    withTempGraph({}, (_graph, dir) => {
      const result = applyPlan(dir, {
        nodes: [
          { ref: "e", kind: "epic", slug: "x", summary: "s" },
          { kind: "knowledge", slug: "k", shared: true, summary: "s" },
          { kind: "knowledge", slug: "k", shared: true, summary: "s" },
        ],
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors[0]).toContain("geri alındı");
      expect(parseGraph(dir).nodesById.size).toBe(0);
    });
  });

  it("dry-run hiçbir şey yazmaz", () => {
    withTempGraph({}, (_graph, dir) => {
      expect(applyPlan(dir, FULL_PLAN, { dryRun: true })).toEqual({
        ok: true,
        dryRun: true,
        created: [],
        expanded: [],
      });
      expect(parseGraph(dir).nodesById.size).toBe(0);
    });
  });
});
