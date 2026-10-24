import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseGraph } from "../graph/parser.js";
import { validateGraph } from "../validate.js";
import { withTempGraph } from "../testUtils/tempGraph.js";

const here = dirname(fileURLToPath(import.meta.url));
const bookstoreGraph = join(here, "../../../docs/examples/bookstore/.graph");

const TASK_OK = {
  id: "E01-T01",
  kind: "task",
  name: "T01-x",
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
};

function frontmatter(obj: Record<string, unknown>): string {
  const lines = Object.entries(obj).map(([k, v]) => `${k}: ${JSON.stringify(v)}`);
  return `---\n${lines.join("\n")}\n---\n`;
}

describe("validateGraph — gerçek bookstore graph", () => {
  it("hiç hata/uyarı yok (graph tamamen SPEC'e uygun yazıldı)", () => {
    const issues = validateGraph(parseGraph(bookstoreGraph));
    expect(issues).toEqual([]);
  });
});

describe("validateGraph — her hata türü için bozuk örnek", () => {
  it("frontmatter şema hatası (eksik zorunlu alan)", () => {
    withTempGraph(
      { "a.md": frontmatter({ id: "E01", kind: "epic", name: "a" }) }, // summary/status/expanded eksik
      (graph) => {
        const issues = validateGraph(graph);
        expect(issues.some((i) => i.message.includes("summary"))).toBe(true);
      },
    );
  });

  it("kırık depends_on linki hata üretir", () => {
    withTempGraph({ "a.md": frontmatter({ ...TASK_OK, depends_on: ["E01-T99"] }) }, (graph) => {
      const issues = validateGraph(graph);
      expect(issues.some((i) => i.message.includes("depends_on hedefi bulunamadı"))).toBe(true);
    });
  });

  it("draft:true olan düğümde kırık depends_on linki ES GEÇİLİR", () => {
    withTempGraph(
      { "a.md": frontmatter({ ...TASK_OK, depends_on: ["E01-T99"], draft: true }) },
      (graph) => {
        const issues = validateGraph(graph);
        expect(issues.some((i) => i.message.includes("depends_on hedefi bulunamadı"))).toBe(false);
      },
    );
  });

  it("kırık reads linki hata üretir", () => {
    withTempGraph(
      { "a.md": frontmatter({ ...TASK_OK, reads: ["[[yok-boyle-bir-sey]]"] }) },
      (graph) => {
        const issues = validateGraph(graph);
        expect(issues.some((i) => i.message.includes("reads hedefi bulunamadı"))).toBe(true);
      },
    );
  });

  it("depends_on farklı türe işaret ederse hata üretir (task → feature)", () => {
    withTempGraph(
      {
        "feature.md": frontmatter({
          id: "E01-F01",
          kind: "feature",
          name: "F01-x",
          summary: "s",
          status: "pending",
          expanded: false,
        }),
        "task.md": frontmatter({ ...TASK_OK, depends_on: ["E01-F01"] }),
      },
      (graph) => {
        const issues = validateGraph(graph);
        expect(
          issues.some((i) => i.message.includes("depends_on sadece aynı türe işaret edebilir")),
        ).toBe(true);
      },
    );
  });

  it("reads knowledge olmayan bir düğüme işaret ederse hata üretir", () => {
    withTempGraph(
      { "task.md": frontmatter({ ...TASK_OK, name: "shared-name", reads: ["[[shared-name]]"] }) },
      (graph) => {
        const issues = validateGraph(graph);
        expect(
          issues.some((i) => i.message.includes("reads sadece knowledge düğümüne işaret edebilir")),
        ).toBe(true);
      },
    );
  });

  it("depends_on döngüsü hata üretir", () => {
    withTempGraph(
      {
        "a.md": frontmatter({ ...TASK_OK, id: "E01-T01", name: "T01-a", depends_on: ["E01-T02"] }),
        "b.md": frontmatter({ ...TASK_OK, id: "E01-T02", name: "T02-b", depends_on: ["E01-T01"] }),
      },
      (graph) => {
        const issues = validateGraph(graph);
        expect(issues.some((i) => i.message.includes("döngüsü"))).toBe(true);
      },
    );
  });

  it("status:done ama Handoff bölümü yoksa hata üretir", () => {
    withTempGraph(
      { "a.md": frontmatter({ ...TASK_OK, status: "done" }) + "\n## Görev\nx\n" },
      (graph) => {
        const issues = validateGraph(graph);
        expect(issues.some((i) => i.message.includes("Handoff"))).toBe(true);
      },
    );
  });

  it("Handoff 300 token sınırını aşarsa uyarı üretir", () => {
    const longHandoff = "x ".repeat(2000); // ~500 token
    withTempGraph(
      {
        "a.md": frontmatter({ ...TASK_OK, status: "done" }) + `\n## Handoff\n${longHandoff}\n`,
      },
      (graph) => {
        const issues = validateGraph(graph);
        const warning = issues.find((i) => i.message.includes("Handoff ~"));
        expect(warning?.severity).toBe("warning");
      },
    );
  });

  it("config.yml şema hatası (routing boş dizi) hata üretir", () => {
    withTempGraph(
      {
        "a.md": frontmatter(TASK_OK),
        "config.yml":
          "routing: []\nescalation: [haiku]\nmax_attempts_per_model: 1\nbudgets: { default_context: 8000, max_turns: 25 }\n",
      },
      (graph) => {
        const issues = validateGraph(graph);
        expect(issues.some((i) => i.message.startsWith("config.yml:"))).toBe(true);
      },
    );
  });

  it("brief.md 1500 token sınırını aşarsa uyarı üretir", () => {
    const longBrief = "x ".repeat(8000); // ~4000 token
    withTempGraph({ "brief.md": `# Brief\n${longBrief}\n` }, (graph) => {
      const issues = validateGraph(graph);
      expect(issues.some((i) => i.message.includes("brief.md"))).toBe(true);
    });
  });
});

const TASK5 = (overrides: Record<string, unknown>) => ({
  kind: "task",
  level: 3,
  summary: "s",
  type: "feature",
  complexity: "med",
  risk: "low",
  context_size: "small",
  model: "auto",
  agent: "auto",
  touches: [],
  context_budget: 8000,
  status: "pending",
  attempts: 0,
  ...overrides,
});
const FEATURE5 = (overrides: Record<string, unknown>) => ({
  kind: "feature",
  summary: "s",
  status: "pending",
  expanded: true,
  ...overrides,
});
const CONFIG_YML_5 =
  "routing:\n  - when: {}\n    model: haiku\nescalation: [haiku]\nmax_attempts_per_model: 1\nbudgets: { default_context: 8000, max_turns: 25 }\n";

describe("validateGraph — Faz 5.5 aşırı/yetersiz bölme uyarıları", () => {
  it("feature 13 görev içerirse uyarı üretir", () => {
    const files: Record<string, string> = {
      "f.md": frontmatter(FEATURE5({ id: "E01-F01", name: "F01-x" })),
    };
    for (let i = 1; i <= 13; i++) {
      const n = String(i).padStart(2, "0");
      files[`t${n}.md`] = frontmatter(TASK5({ id: `E01-F01-T${n}`, name: `F01-T${n}-x` }));
    }
    withTempGraph(files, (graph) => {
      const issues = validateGraph(graph);
      expect(issues.some((i) => i.message.includes("13 görev içeriyor"))).toBe(true);
    });
  });

  it("aynı feature'da 2+ küçük görev birleştirme uyarısı üretir", () => {
    withTempGraph(
      {
        "f.md": frontmatter(FEATURE5({ id: "E01-F01", name: "F01-x" })),
        "a.md": frontmatter(TASK5({ id: "E01-F01-T01", name: "F01-T01-a", complexity: "low" })),
        "b.md": frontmatter(TASK5({ id: "E01-F01-T02", name: "F01-T02-b", complexity: "low" })),
      },
      (graph) => {
        const issues = validateGraph(graph);
        expect(issues.some((i) => i.message.includes("birleştirme adayı"))).toBe(true);
      },
    );
  });

  it("tek küçük görev varsa birleştirme uyarısı üretilmez (en az 2 gerekir)", () => {
    withTempGraph(
      {
        "f.md": frontmatter(FEATURE5({ id: "E01-F01", name: "F01-x" })),
        "a.md": frontmatter(TASK5({ id: "E01-F01-T01", name: "F01-T01-a", complexity: "low" })),
      },
      (graph) => {
        const issues = validateGraph(graph);
        expect(issues.some((i) => i.message.includes("birleştirme adayı"))).toBe(false);
      },
    );
  });

  it("test tipi görevler küçük-görev heuristiğinden muaf", () => {
    withTempGraph(
      {
        "f.md": frontmatter(FEATURE5({ id: "E01-F01", name: "F01-x" })),
        "a.md": frontmatter(
          TASK5({ id: "E01-F01-T01", name: "F01-T01-a", complexity: "low", type: "test" }),
        ),
        "b.md": frontmatter(
          TASK5({ id: "E01-F01-T02", name: "F01-T02-b", complexity: "low", type: "test" }),
        ),
      },
      (graph) => {
        const issues = validateGraph(graph);
        expect(issues.some((i) => i.message.includes("birleştirme adayı"))).toBe(false);
      },
    );
  });

  it("context_budget çok küçükse overBudget uyarısı üretir (gp context'i yeniden kullanır)", () => {
    withTempGraph(
      {
        "f.md": frontmatter(FEATURE5({ id: "E01-F01", name: "F01-x" })),
        "a.md": frontmatter(TASK5({ id: "E01-F01-T01", name: "F01-T01-a", context_budget: 5 })),
        "config.yml": CONFIG_YML_5,
      },
      (graph) => {
        const issues = validateGraph(graph);
        expect(issues.some((i) => i.message.includes("context_budget"))).toBe(true);
      },
    );
  });

  it("config.yml yoksa overBudget kontrolü sessizce atlanır (çökmez)", () => {
    withTempGraph(
      {
        "f.md": frontmatter(FEATURE5({ id: "E01-F01", name: "F01-x" })),
        "a.md": frontmatter(TASK5({ id: "E01-F01-T01", name: "F01-T01-a" })),
      },
      (graph) => {
        expect(() => validateGraph(graph)).not.toThrow();
      },
    );
  });
});
