import { describe, expect, it } from "vitest";
import {
  computeAllKnowledgeSyncReports,
  computeKnowledgeSyncReport,
  hashFileContent,
} from "../sourceHash.js";
import { withTempGraph } from "../testUtils/tempGraph.js";
import type { GraphNode } from "../graph/types.js";

function knowledgeNode(overrides: Record<string, unknown> = {}): GraphNode {
  return {
    id: "catalog-api",
    kind: "knowledge",
    name: "catalog-api",
    filePath: "/tmp/k.md",
    relPath: "k.md",
    epicId: "E01",
    body: "## Özet\nx\n",
    frontmatter: {
      scope: "epic",
      updated_by: [],
      source_files: ["src/catalog.ts"],
      source_hashes: {},
      ...overrides,
    },
  };
}

describe("computeKnowledgeSyncReport", () => {
  it("hiç hash kaydı yoksa 'never-hashed' döner", () => {
    const report = computeKnowledgeSyncReport(knowledgeNode(), "/proj", () => "abc123");
    expect(report.files).toEqual([{ path: "src/catalog.ts", state: "never-hashed", currentHash: "abc123" }]);
  });

  it("stored hash güncel hash ile eşleşirse 'ok'", () => {
    const node = knowledgeNode({ source_hashes: { "src/catalog.ts": "abc123" } });
    const report = computeKnowledgeSyncReport(node, "/proj", () => "abc123");
    expect(report.files).toEqual([{ path: "src/catalog.ts", state: "ok" }]);
  });

  it("stored hash uyuşmazsa 'changed' (şüpheli — kod değişmiş)", () => {
    const node = knowledgeNode({ source_hashes: { "src/catalog.ts": "eski-hash" } });
    const report = computeKnowledgeSyncReport(node, "/proj", () => "yeni-hash");
    expect(report.files).toEqual([
      { path: "src/catalog.ts", state: "changed", previousHash: "eski-hash", currentHash: "yeni-hash" },
    ]);
  });

  it("dosya artık yoksa 'missing' — hata fırlatmaz (9.5 'eksik dosya' toleransı)", () => {
    const report = computeKnowledgeSyncReport(knowledgeNode(), "/proj", () => null);
    expect(report.files).toEqual([{ path: "src/catalog.ts", state: "missing" }]);
  });

  it("source_files boşsa boş dosya listesi döner", () => {
    const report = computeKnowledgeSyncReport(knowledgeNode({ source_files: [] }), "/proj", () => "x");
    expect(report.files).toEqual([]);
  });
});

describe("hashFileContent", () => {
  it("aynı içerik aynı hash'i üretir, farklı içerik farklı", () => {
    expect(hashFileContent("a")).toBe(hashFileContent("a"));
    expect(hashFileContent("a")).not.toBe(hashFileContent("b"));
  });
});

describe("computeAllKnowledgeSyncReports", () => {
  it("sadece source_files'ı olan knowledge düğümlerini raporlar, task/epic'i atlar", () => {
    withTempGraph(
      {
        "e/epic.md":
          '---\nid: E01\nkind: epic\nname: E01\nsummary: s\nstatus: pending\nexpanded: true\ndepends_on: []\ndraft: false\n---\n',
        "e/k1.md":
          '---\nid: catalog-api\nkind: knowledge\nname: catalog-api\nsummary: s\nscope: epic\nupdated_by: []\nsource_files: ["src/a.ts"]\n---\n## Özet\nx\n',
        "e/k2.md":
          '---\nid: empty-knowledge\nkind: knowledge\nname: empty-knowledge\nsummary: s\nscope: epic\nupdated_by: []\nsource_files: []\n---\n## Özet\nx\n',
      },
      (graph) => {
        const reports = computeAllKnowledgeSyncReports(graph, "/proj", () => "h");
        expect(reports.map((r) => r.nodeId)).toEqual(["catalog-api"]);
      },
    );
  });
});
