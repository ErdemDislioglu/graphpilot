import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { parseGraph } from "../parser.js";
import { getChildren, getDependsOn, getReads } from "../types.js";

const here = dirname(fileURLToPath(import.meta.url));
const bookstoreGraph = join(here, "../../../../docs/examples/bookstore/.graph");

describe("parseGraph — örnek bookstore graph", () => {
  const graph = parseGraph(bookstoreGraph);

  it("hiç parseError üretmiyor", () => {
    expect(graph.parseErrors).toEqual([]);
  });

  it("11 düğüm buldu (1 epic + 2 feature + 5 task + 3 knowledge)", () => {
    expect(graph.nodesById.size).toBe(11);
  });

  it("brief.md ayrı okundu, bir graph düğümü olarak sayılmadı", () => {
    expect(graph.briefBody).toContain("## Amaç");
    expect(graph.nodesById.has("brief")).toBe(false);
  });

  it("config.yml ham okundu", () => {
    expect(graph.rawConfig).toMatchObject({ escalation: ["haiku", "sonnet", "opus"] });
  });

  it("epicId doğru türetildi: task/feature ID'den, knowledge klasör adından", () => {
    expect(graph.nodesById.get("E01-F01-T01")?.epicId).toBe("E01");
    expect(graph.nodesById.get("E01-F02")?.epicId).toBe("E01");
    expect(graph.nodesByName.get("catalog-api")?.epicId).toBe("E01"); // epic-scope knowledge
    expect(graph.nodesByName.get("db-schema")?.epicId).toBe(null); // _shared
  });

  it("parent_of kenarları: epic→feature, feature→task", () => {
    const epicChildren = getChildren(graph, "E01")
      .map((n) => n.id)
      .sort();
    expect(epicChildren).toEqual(["E01-F01", "E01-F02"]);
    const featureChildren = getChildren(graph, "E01-F01")
      .map((n) => n.id)
      .sort();
    expect(featureChildren).toEqual(["E01-F01-T01", "E01-F01-T02", "E01-F01-T03"]);
  });

  it("depends_on kenarları doğru", () => {
    const deps = getDependsOn(graph, "E01-F01-T02").map((n) => n.id);
    expect(deps).toEqual(["E01-F01-T01"]);
  });

  it("reads kenarları frontmatter'dan çözülüyor ([[catalog-api]] → catalog-api düğümü)", () => {
    const reads = getReads(graph, "E01-F01-T02")
      .map((n) => n.name)
      .sort();
    expect(reads).toEqual(["catalog-api", "db-schema"]);
  });

  it("feature-düzeyi depends_on (cart → search) çalışıyor", () => {
    const deps = getDependsOn(graph, "E01-F02").map((n) => n.id);
    expect(deps).toEqual(["E01-F01"]);
  });
});

describe("parseGraph — bozuk girdiler parseErrors'a düşer, süreci düşürmez", () => {
  function withTempGraph(fn: (dir: string) => void): ReturnType<typeof parseGraph> {
    const dir = mkdtempSync(join(tmpdir(), "gp-parser-test-"));
    try {
      fn(dir);
      return parseGraph(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  it("Faz 9.6 hata enjeksiyonu — sözdizimi BOZUK YAML frontmatter çökmez, parseError'a düşer", () => {
    const graph = withTempGraph((dir) => {
      // Kapanmamış köşeli parantez — js-yaml bunu gerçekten reddeder (semantik hata değil,
      // SÖZDİZİMİ hatası; `parseFrontmatter`'ın try/catch'ini test eder).
      writeFileSync(join(dir, "bozuk.md"), "---\nid: [E01\nkind: epic\nname: a\n---\n## x\n");
      writeFileSync(join(dir, "iyi.md"), "---\nid: E02\nkind: epic\nname: b\n---\n## x\n");
    });
    expect(graph.parseErrors.length).toBe(1);
    expect(graph.parseErrors[0].message).toContain("frontmatter parse hatası");
    // Bozuk dosya diğerini düşürmüyor — iyi.md yine de parse edildi.
    expect(graph.nodesById.has("E02")).toBe(true);
    expect(graph.nodesById.has("E01")).toBe(false);
  });

  it("tekrarlanan id iki dosyada da parseError üretir, ikincisini atlar", () => {
    const graph = withTempGraph((dir) => {
      writeFileSync(join(dir, "a.md"), "---\nid: E01\nkind: epic\nname: a\n---\n");
      writeFileSync(join(dir, "b.md"), "---\nid: E01\nkind: epic\nname: b\n---\n");
    });
    expect(graph.nodesById.size).toBe(1);
    expect(graph.parseErrors.some((e) => e.message.includes("tekrarlanan id"))).toBe(true);
  });

  it("bilinmeyen kind parseError üretir, dosyayı atlar", () => {
    const graph = withTempGraph((dir) => {
      writeFileSync(join(dir, "x.md"), "---\nid: E01\nkind: nonsense\nname: x\n---\n");
    });
    expect(graph.nodesById.size).toBe(0);
    expect(graph.parseErrors.some((e) => e.message.includes("bilinmeyen"))).toBe(true);
  });

  it("INDEX.md ve _index.md graph düğümü olarak okunmaz", () => {
    const graph = withTempGraph((dir) => {
      writeFileSync(join(dir, "INDEX.md"), "# otomatik\n");
      mkdirSync(join(dir, "E01-x"));
      writeFileSync(join(dir, "E01-x/_index.md"), "# otomatik\n");
      writeFileSync(
        join(dir, "E01-x/epic.md"),
        "---\nid: E01\nkind: epic\nname: E01-x\nsummary: s\nstatus: pending\nexpanded: false\n---\n",
      );
    });
    expect(graph.nodesById.size).toBe(1);
    expect(graph.parseErrors).toEqual([]);
  });

  it("bulunmayan graph kökünde anlamlı hata fırlatır", () => {
    expect(() => parseGraph("/kesinlikle/yok/boyle/bir/yol")).toThrow(/bulunamadı/);
  });

  it("Faz 8 pilot koşusunda bulunan gerçek bug: _runtime/*.context.md düğüm gibi parse edilmemeli", () => {
    // gp context'in ürettiği gerçek bir context dosyasının geçerli bir graph frontmatter'ı
    // (kind alanı) YOKTUR — gerçek bir /gp:run döngüsünde context HER ZAMAN validate'ten
    // önce çalışır (SKILL.md 2 → 4.1), bu yüzden bu kombinasyon kaçınılmaz.
    const graph = withTempGraph((dir) => {
      writeFileSync(
        join(dir, "a.md"),
        "---\nid: E01\nkind: epic\nname: a\nsummary: s\nstatus: pending\nexpanded: false\n---\n",
      );
      mkdirSync(join(dir, "_runtime"));
      writeFileSync(
        join(dir, "_runtime/E01-F01-T01.context.md"),
        "## brief\n\niçerik\n\n---\n\n## node\n\n```yaml\nid: \"E01-F01-T01\"\n```\n",
      );
    });
    expect(graph.parseErrors).toEqual([]);
    expect(graph.nodesById.size).toBe(1);
  });
});
