import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseGraph } from "../graph/parser.js";
import { buildContext, writeContextFile } from "../context.js";
import { ConfigSchema } from "../schema/index.js";
import { withTempGraph } from "../testUtils/tempGraph.js";

const here = dirname(fileURLToPath(import.meta.url));
const bookstoreGraph = join(here, "../../../docs/examples/bookstore/.graph");

describe("buildContext — gerçek bookstore graph (E01-F01-T02)", () => {
  const graph = parseGraph(bookstoreGraph);
  const config = ConfigSchema.parse(graph.rawConfig);
  const result = buildContext(graph, "E01-F01-T02", config);

  it("sabit sıra: brief → epic-index → read:catalog-api → read:db-schema → handoff:T01 → node", () => {
    // Her parça "\n\n---\n\n" ile ayrılır ve ilk satırı "## <label>"dir (context.ts'in
    // kendi birleştirme mantığı) — gömülü içeriklerin (brief/knowledge body'si) kendi
    // "##" başlıklarıyla karışmaması için parçaları ayıraçtan bölüp sadece ilk satırı al.
    const partLabels = result.markdown.split("\n\n---\n\n").map((chunk) => chunk.split("\n")[0]);
    expect(partLabels).toEqual([
      "## brief",
      "## epic-index",
      "## read:catalog-api",
      "## read:db-schema",
      "## handoff:E01-F01-T01",
      "## node",
    ]);
  });

  it("handoff:T01 bölümü SADECE Handoff içeriğini taşır, T01'in tüm body'sini değil", () => {
    expect(result.markdown).toContain("Public arayüz");
    // T01'in "## Görev" başlığı (Handoff'tan önceki bölüm) context'e sızmamalı
    const afterHandoffLabel = result.markdown.split("## handoff:E01-F01-T01")[1];
    const beforeNextSection = afterHandoffLabel.split("\n\n---\n\n## node")[0];
    expect(beforeNextSection).not.toContain("## Görev");
  });

  it("read:catalog-api tam gövdeyi içerir (## Özet, ## Arayüz, ## Kararlar, ## Dikkat)", () => {
    const section = result.markdown.split("## read:catalog-api")[1].split("\n\n---\n\n")[0];
    expect(section).toContain("## Özet");
    expect(section).toContain("## Arayüz");
    expect(section).toContain("## Dikkat");
  });

  it("budget node.context_budget'tan gelir (T02: 10000)", () => {
    expect(result.budget).toBe(10000);
  });

  it("parts token'a göre büyükten küçüğe sıralı", () => {
    for (let i = 1; i < result.parts.length; i++) {
      expect(result.parts[i - 1].tokens).toBeGreaterThanOrEqual(result.parts[i].tokens);
    }
  });
});

describe("buildContext — Faz 7.1/7.10 ablasyon anahtarı: cache_friendly_order", () => {
  const graph = parseGraph(bookstoreGraph);

  it("false ise sabit sıra yerine alfabetik sıra kullanılır (SADECE ölçüm için)", () => {
    const config = ConfigSchema.parse({
      ...(graph.rawConfig as Record<string, unknown>),
      optimizations: { cache_friendly_order: false },
    });
    const result = buildContext(graph, "E01-F01-T02", config);
    const partLabels = result.markdown.split("\n\n---\n\n").map((chunk) => chunk.split("\n")[0]);
    const sorted = [...partLabels].sort();
    expect(partLabels).toEqual(sorted);
  });

  it("varsayılan (true) sabit sırayı korur", () => {
    const config = ConfigSchema.parse(graph.rawConfig as Record<string, unknown>);
    const result = buildContext(graph, "E01-F01-T02", config);
    const partLabels = result.markdown.split("\n\n---\n\n").map((chunk) => chunk.split("\n")[0]);
    expect(partLabels[0]).toBe("## brief");
    expect(partLabels[partLabels.length - 1]).toBe("## node");
  });
});

describe("buildContext — determinizm (kabul kriteri: byte-byte aynı)", () => {
  it("aynı graph'ı iki kez parse edip bağlam kurmak byte-byte aynı sonucu verir", () => {
    const config = ConfigSchema.parse(parseGraph(bookstoreGraph).rawConfig);
    const first = buildContext(parseGraph(bookstoreGraph), "E01-F01-T02", config);
    const second = buildContext(parseGraph(bookstoreGraph), "E01-F01-T02", config);
    expect(second.markdown).toBe(first.markdown);
    expect(second.tokenEstimate).toBe(first.tokenEstimate);
  });
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
  context_budget: 100,
  status: "pending",
  attempts: 0,
  ...overrides,
});

function frontmatter(obj: Record<string, unknown>, body = "## Görev\nx\n"): string {
  const lines = Object.entries(obj).map(([k, v]) => `${k}: ${JSON.stringify(v)}`);
  return `---\n${lines.join("\n")}\n---\n${body}`;
}

const MINIMAL_CONFIG = ConfigSchema.parse({
  routing: [{ when: {}, model: "haiku" }],
  escalation: ["haiku"],
  max_attempts_per_model: 1,
  budgets: { default_context: 8000, max_turns: 25 },
});

describe("buildContext — geçişli bağımlılıklar dahil edilmez", () => {
  it("A <- B <- C zincirinde C'nin context'i A'nın Handoff'unu İÇERMEZ, sadece B'ninkini içerir", () => {
    withTempGraph(
      {
        "a.md": frontmatter(
          TASK({ id: "E01-F01-T01", name: "a" }),
          "## Handoff\nA-HANDOFF-ICERIGI\n",
        ),
        "b.md": frontmatter(
          TASK({ id: "E01-F01-T02", name: "b", depends_on: ["E01-F01-T01"] }),
          "## Handoff\nB-HANDOFF-ICERIGI\n",
        ),
        "c.md": frontmatter(TASK({ id: "E01-F01-T03", name: "c", depends_on: ["E01-F01-T02"] })),
      },
      (graph) => {
        const result = buildContext(graph, "E01-F01-T03", MINIMAL_CONFIG);
        expect(result.markdown).toContain("B-HANDOFF-ICERIGI");
        expect(result.markdown).not.toContain("A-HANDOFF-ICERIGI");
      },
    );
  });
});

describe("buildContext — bütçe aşımı", () => {
  it("içerik bütçeyi aşarsa overBudget true olur", () => {
    withTempGraph(
      { "a.md": frontmatter(TASK({ id: "E01-F01-T01", name: "a", context_budget: 10 })) },
      (graph) => {
        const result = buildContext(graph, "E01-F01-T01", MINIMAL_CONFIG);
        expect(result.overBudget).toBe(true);
      },
    );
  });
});

describe("writeContextFile", () => {
  it(".graph/_runtime/<id>.context.md dosyasını yazar", () => {
    withTempGraph({ "a.md": frontmatter(TASK({ id: "E01-F01-T01", name: "a" })) }, (graph) => {
      writeContextFile(graph, "E01-F01-T01", MINIMAL_CONFIG);
      const outPath = join(graph.rootDir, "_runtime", "E01-F01-T01.context.md");
      expect(existsSync(outPath)).toBe(true);
      expect(readFileSync(outPath, "utf-8")).toContain("## node");
    });
  });

  it("Faz 9.7 — sır gibi görünen içerik varsa YAZMAZ, hata fırlatır", () => {
    withTempGraph(
      {
        "a.md": frontmatter(
          TASK({ id: "E01-F01-T01", name: "a" }),
          "## Görev\nSTRIPE_SECRET=sk_live_abcdef1234567890ghij kullan\n",
        ),
      },
      (graph) => {
        expect(() => writeContextFile(graph, "E01-F01-T01", MINIMAL_CONFIG)).toThrow(/sır/);
        const outPath = join(graph.rootDir, "_runtime", "E01-F01-T01.context.md");
        expect(existsSync(outPath)).toBe(false);
      },
    );
  });
});

describe("buildContext — Faz 14 B8: repo-map her pakete girer", () => {
  const REPO_MAP =
    '---\nid: repo-map\nkind: knowledge\nname: repo-map\nsummary: "harita"\nscope: shared\nupdated_by: []\nsource_files: []\n---\n## Arayüz\nsrc/a.js: a\n';

  it("optimizations.repo_map açıkken reads'te olmasa da read:repo-map eklenir (bir kez)", () => {
    withTempGraph(
      {
        "_shared/knowledge/repo-map.md": REPO_MAP,
        "a.md": frontmatter(TASK({ id: "E01-F01-T01", name: "a" })),
        "b.md": frontmatter(TASK({ id: "E01-F01-T02", name: "b", reads: ["[[repo-map]]"] })),
      },
      (graph) => {
        const a = buildContext(graph, "E01-F01-T01", MINIMAL_CONFIG).markdown;
        expect(a).toContain("## read:repo-map\n\n## Arayüz\nsrc/a.js: a");
        const b = buildContext(graph, "E01-F01-T02", MINIMAL_CONFIG).markdown;
        expect(b.split("## read:repo-map").length - 1).toBe(1);
      },
    );
  });

  it("optimizations.repo_map kapalıysa eklenmez", () => {
    withTempGraph(
      {
        "_shared/knowledge/repo-map.md": REPO_MAP,
        "a.md": frontmatter(TASK({ id: "E01-F01-T01", name: "a" })),
      },
      (graph) => {
        const config = { ...MINIMAL_CONFIG, optimizations: { ...MINIMAL_CONFIG.optimizations, repo_map: false } };
        expect(buildContext(graph, "E01-F01-T01", config).markdown).not.toContain("read:repo-map");
      },
    );
  });
});
