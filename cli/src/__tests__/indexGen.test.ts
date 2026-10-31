import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseGraph } from "../graph/parser.js";
import { generateEpicIndex, generateRootIndex } from "../indexGen.js";
import { withTempGraph } from "../testUtils/tempGraph.js";

const here = dirname(fileURLToPath(import.meta.url));
const bookstoreGraph = join(here, "../../../docs/examples/bookstore/.graph");

describe("generateRootIndex — gerçek bookstore graph", () => {
  const graph = parseGraph(bookstoreGraph);
  const output = generateRootIndex(graph);

  it("otomatik üretim uyarısını içerir", () => {
    expect(output).toContain("OTOMATİK ÜRETİLİR");
  });

  it("brief özetini içerir", () => {
    expect(output).toContain("## Brief");
    expect(output).toContain("Küçük bir kitap satış sitesi");
  });

  it("E01 satırını doğru ilerleme yüzdesiyle içerir (1/6 done = %17)", () => {
    expect(output).toMatch(/\| E01 \| epic \| Katalog ve ürün arama \| running \| 17% \|/);
  });

  it("deterministik: aynı graph'ı iki kez parse edip üretmek byte-byte aynı sonucu verir", () => {
    const again = generateRootIndex(parseGraph(bookstoreGraph));
    expect(again).toBe(output);
  });
});

describe("generateEpicIndex — gerçek bookstore graph", () => {
  const graph = parseGraph(bookstoreGraph);
  const output = generateEpicIndex(graph, "E01");

  it("iki feature + altı task + iki epic-scope knowledge satırı içerir (10 satır)", () => {
    const rows = output
      .split("\n")
      .filter((l) => l.startsWith("| E01") || l.startsWith("| cart") || l.startsWith("| catalog"));
    expect(rows.length).toBe(10);
  });

  it("task satırlarında model sütunu gp route'tan geliyor (T01 → haiku)", () => {
    expect(output).toMatch(/\| E01-F01-T01 \| task \| .*\| done \| haiku \|/);
  });

  it("feature/knowledge satırlarında model sütunu '–'", () => {
    expect(output).toMatch(/\| E01-F01 \| feature \|.*\| – \|/);
    expect(output).toMatch(/\| cart \| knowledge \|.*\| – \|/);
  });

  it("deterministik: iki üretim byte-byte aynı", () => {
    expect(generateEpicIndex(parseGraph(bookstoreGraph), "E01")).toBe(output);
  });

  it("var olmayan epic için düşmeden çalışır", () => {
    expect(() => generateEpicIndex(graph, "E99")).not.toThrow();
    expect(generateEpicIndex(graph, "E99")).toContain("epic bulunamadı");
  });
});

describe("generateEpicIndex — Faz 14 B10: model sütunu gp route ile aynı kaynaktan", () => {
  const files = (config: string) => ({
    "E01-x/epic.md":
      '---\nid: "E01"\nkind: "epic"\nname: "E01-x"\nsummary: "s"\nstatus: "pending"\nexpanded: true\n---\n',
    "E01-x/tasks/F01-T01-a.md":
      '---\nid: "E01-F01-T01"\nkind: "task"\nname: "F01-T01-a"\nlevel: 3\nsummary: "s"\ntype: "test"\ncomplexity: "low"\nrisk: "low"\ncontext_size: "small"\nmodel: "auto"\nagent: "auto"\ncontext_budget: 8000\nstatus: "pending"\nattempts: 0\n---\n',
    "config.yml": config,
  });
  const ROUTING = "routing:\n  - when: {}\n    model: opus\nescalation: [opus]\nmax_attempts_per_model: 1\nbudgets: { default_context: 8000, max_turns: 25 }\n";

  it("ekip modu açıkken (varsayılan) team tablosu kullanılır, config.routing değil", () => {
    withTempGraph(files(ROUTING), (graph) => {
      expect(generateEpicIndex(graph, "E01")).toMatch(/\| E01-F01-T01 \| task \| s \| pending \| haiku \|/);
    });
  });

  it("ekip modu kapalıyken config.routing kullanılır", () => {
    withTempGraph(files(`${ROUTING}team: { enabled: false }\n`), (graph) => {
      expect(generateEpicIndex(graph, "E01")).toMatch(/\| E01-F01-T01 \| task \| s \| pending \| opus \|/);
    });
  });
});
