import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseGraph } from "../graph/parser.js";
import { buildResumeSummary } from "../resume.js";
import { estimateTokens } from "../tokens.js";
import { withTempGraph } from "../testUtils/tempGraph.js";

const here = dirname(fileURLToPath(import.meta.url));
const bookstoreGraph = join(here, "../../../docs/examples/bookstore/.graph");

describe("buildResumeSummary — gerçek bookstore graph", () => {
  const summary = buildResumeSummary(parseGraph(bookstoreGraph));

  it("~500 token bütçesinin altında kalır", () => {
    expect(estimateTokens(summary)).toBeLessThan(500);
  });

  it("running kalmış düğümleri listeler (E01, E01-F01)", () => {
    expect(summary).toContain("E01");
    expect(summary).toContain("E01-F01");
  });

  it("sıradaki hazır görevleri listeler (T02, F02-T01)", () => {
    expect(summary).toContain("E01-F01-T02");
    expect(summary).toContain("E01-F02-T01");
  });

  it("başarısızlık yoksa '(yok)' yazar", () => {
    const section = summary.split("## Son başarısızlıklar")[1];
    expect(section.trim().split("\n")[0]).toBe("(yok)");
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
  context_budget: 8000,
  attempts: 0,
  ...overrides,
});

function frontmatter(obj: Record<string, unknown>, body: string): string {
  const lines = Object.entries(obj).map(([k, v]) => `${k}: ${JSON.stringify(v)}`);
  return `---\n${lines.join("\n")}\n---\n${body}`;
}

describe("buildResumeSummary — Yarım iş ve Hata geçmişi bölümleri yakalanır", () => {
  it("running düğümün Yarım iş notu özete girer", () => {
    withTempGraph(
      {
        "a.md": frontmatter(
          TASK({ id: "E01-F01-T01", name: "a", status: "running" }),
          "## Yarım iş\nSearch endpoint yazıldı, test kaldı.\n",
        ),
      },
      (graph) => {
        const summary = buildResumeSummary(graph);
        expect(summary).toContain("Search endpoint yazıldı, test kaldı.");
      },
    );
  });

  it("failed düğümün son Hata geçmişi satırı özete girer", () => {
    withTempGraph(
      {
        "a.md": frontmatter(
          TASK({ id: "E01-F01-T01", name: "a", status: "failed" }),
          "## Hata geçmişi\n- deneme 1: tip hatası\n- deneme 2: test timeout\n",
        ),
      },
      (graph) => {
        const summary = buildResumeSummary(graph);
        expect(summary).toContain("deneme 2: test timeout");
        expect(summary).not.toContain("deneme 1: tip hatası");
      },
    );
  });
});
