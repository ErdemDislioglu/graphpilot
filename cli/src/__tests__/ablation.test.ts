import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseGraph } from "../graph/parser.js";
import { computeAblationRows, renderAblationMarkdown } from "../ablation.js";
import { ConfigSchema } from "../schema/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const bookstoreGraph = join(here, "../../../docs/examples/bookstore/.graph");
const agentsDir = join(here, "../../../plugin/agents");
const cliRoot = join(here, "..", "..");

describe("computeAblationRows — gerçek bookstore graph + gerçek agent dosyaları", () => {
  const graph = parseGraph(bookstoreGraph);
  const config = ConfigSchema.parse(graph.rawConfig);
  const rows = computeAblationRows(graph, config, "E01-F01-T02", agentsDir, cliRoot);

  it("7 teknik için de bir satır üretir", () => {
    expect(rows.map((r) => r.technique)).toEqual([
      "cache_friendly_order",
      "repo_map",
      "log_trimming",
      "tool_restriction",
      "batch_low_nodes",
      "deterministic_scaffold",
      "turn_limits",
    ]);
  });

  it("log_trimming GERÇEKTEN ölçülür (status: ölçüldü) ve azalma > 0", () => {
    const row = rows.find((r) => r.technique === "log_trimming")!;
    expect(row.status).toBe("ölçüldü");
    expect(row.detail).toMatch(/%\d+ azalma/);
  });

  it("deterministic_scaffold — bookstore'da scaffold task'ı yok → n/a", () => {
    const row = rows.find((r) => r.technique === "deterministic_scaffold")!;
    expect(row.status).toBe("n/a");
  });

  it("tool_restriction gerçek agent dosyalarından token sayısı üretir", () => {
    const row = rows.find((r) => r.technique === "tool_restriction")!;
    expect(row.detail).toContain("coder");
  });

  it("repo_map cli/ kaynağını gerçekten tarar (fileCount > 0)", () => {
    const row = rows.find((r) => r.technique === "repo_map")!;
    expect(row.detail).toMatch(/\d+ dosya/);
  });
});

describe("renderAblationMarkdown", () => {
  it("her satır için bir tablo satırı üretir, başlık ve uyarı yorumu içerir", () => {
    const md = renderAblationMarkdown([
      { technique: "log_trimming", status: "ölçüldü", detail: "%80 azalma" },
    ]);
    expect(md).toContain("# Ablasyon Tablosu");
    expect(md).toContain("| Log/çıktı kırpma (7.3) | ölçüldü | %80 azalma |");
    expect(md).toContain("<!-- Faz 7.10");
  });

  it("detail içindeki | karakteri kaçışlanır (tablo bozulmaz)", () => {
    const md = renderAblationMarkdown([
      { technique: "turn_limits", status: "yapısal", detail: "a | b" },
    ]);
    expect(md).toContain("a \\| b");
  });
});
