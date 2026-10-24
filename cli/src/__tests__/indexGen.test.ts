import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseGraph } from "../graph/parser.js";
import { generateEpicIndex, generateRootIndex } from "../indexGen.js";

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

  it("E01 satırını doğru ilerleme yüzdesiyle içerir (1/5 done = %20)", () => {
    expect(output).toMatch(/\| E01 \| epic \| Katalog ve ürün arama \| running \| 20% \|/);
  });

  it("deterministik: aynı graph'ı iki kez parse edip üretmek byte-byte aynı sonucu verir", () => {
    const again = generateRootIndex(parseGraph(bookstoreGraph));
    expect(again).toBe(output);
  });
});

describe("generateEpicIndex — gerçek bookstore graph", () => {
  const graph = parseGraph(bookstoreGraph);
  const output = generateEpicIndex(graph, "E01");

  it("iki feature + beş task + iki epic-scope knowledge satırı içerir (9 satır)", () => {
    const rows = output
      .split("\n")
      .filter((l) => l.startsWith("| E01") || l.startsWith("| cart") || l.startsWith("| catalog"));
    expect(rows.length).toBe(9);
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
