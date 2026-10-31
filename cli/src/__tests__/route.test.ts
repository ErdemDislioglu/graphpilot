import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseGraph } from "../graph/parser.js";
import { resolveRoute } from "../route.js";
import { ConfigSchema } from "../schema/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const bookstoreGraph = join(here, "../../../docs/examples/bookstore/.graph");

describe("resolveRoute — gerçek bookstore config.yml", () => {
  const graph = parseGraph(bookstoreGraph);
  const config = ConfigSchema.parse(graph.rawConfig);

  it("complexity:low task → haiku (T01, T03 complexity:low)", () => {
    const t01 = graph.nodesById.get("E01-F01-T01")!;
    expect(resolveRoute(t01, config).model).toBe("haiku");
    const t03 = graph.nodesById.get("E01-F01-T03")!;
    expect(resolveRoute(t03, config).model).toBe("haiku");
  });

  it("complexity:med task → sonnet (T02)", () => {
    const t02 = graph.nodesById.get("E01-F01-T02")!;
    const r = resolveRoute(t02, config);
    expect(r.model).toBe("sonnet");
    expect(r.budget).toBe(10000); // context_budget elle verilmiş
  });

  it("type:test → agent: tester (T03)", () => {
    const t03 = graph.nodesById.get("E01-F01-T03")!;
    expect(resolveRoute(t03, config).agent).toBe("tester");
  });

  it("type:feature → agent: coder (T01)", () => {
    const t01 = graph.nodesById.get("E01-F01-T01")!;
    expect(resolveRoute(t01, config).agent).toBe("coder");
  });

  it("max_turns her zaman config.budgets'tan gelir", () => {
    const t01 = graph.nodesById.get("E01-F01-T01")!;
    expect(resolveRoute(t01, config).max_turns).toBe(25);
  });
});

describe("resolveRoute — davranış kuralları", () => {
  const config = ConfigSchema.parse({
    routing: [
      { when: { complexity: "low" }, model: "haiku" },
      { when: { complexity: "med" }, model: "sonnet" },
    ],
    escalation: ["haiku", "sonnet", "opus"],
    max_attempts_per_model: 1,
    budgets: { default_context: 8000, max_turns: 25 },
  });

  function task(overrides: Record<string, unknown>) {
    return {
      id: "E01-F01-T01",
      kind: "task" as const,
      name: "x",
      filePath: "x",
      relPath: "x",
      body: "",
      epicId: "E01",
      frontmatter: {
        model: "auto",
        agent: "auto",
        complexity: "low",
        type: "feature",
        ...overrides,
      },
    };
  }

  it("elle model verilmişse routing tablosu hiç çalışmaz", () => {
    const node = task({ model: "opus", complexity: "low" }); // low → haiku olurdu ama elle opus
    expect(resolveRoute(node, config).model).toBe("opus");
  });

  it("hiçbir kural eşleşmezse hata fırlatır (sessiz varsayılan yok)", () => {
    const node = task({ complexity: "high" }); // config'te high kuralı yok
    expect(() => resolveRoute(node, config)).toThrow(/eşleşen routing kuralı yok/);
  });

  it("task olmayan düğümde hata fırlatır", () => {
    const node = { ...task({}), kind: "feature" as const };
    expect(() => resolveRoute(node, config)).toThrow(/sadece task düğümlerine/);
  });

  it("context_budget verilmemişse config.budgets.default_context kullanılır", () => {
    const node = task({});
    delete (node.frontmatter as Record<string, unknown>).context_budget;
    expect(resolveRoute(node, config).budget).toBe(8000);
  });
});

describe("resolveRoute — Faz 14 O2 test görevi sınırı", () => {
  const rules = [
    { when: { complexity: "low" }, model: "haiku" },
    { when: { complexity: "med" }, model: "sonnet" },
    { when: { complexity: "high" }, model: "opus" },
    { when: { risk: "high" }, model: "opus" },
  ];
  const base = {
    routing: rules,
    escalation: ["haiku", "sonnet", "opus"],
    max_attempts_per_model: 1,
    budgets: { default_context: 8000, max_turns: 25 },
  };
  const node = (fm: Record<string, unknown>) => ({
    id: "E01-F01-T02",
    kind: "task" as const,
    name: "x",
    filePath: "x",
    relPath: "x",
    body: "",
    epicId: "E01",
    frontmatter: { model: "auto", agent: "auto", ...fm },
  });

  it("risk: high + complexity: high test görevi opus değil tester/sonnet'e gider", () => {
    const r = resolveRoute(node({ type: "test", complexity: "high", risk: "high" }), ConfigSchema.parse(base));
    expect(r).toMatchObject({ agent: "tester", model: "sonnet" });
  });

  it("aynı risk/complexity'de feature görevi opus'ta kalır", () => {
    const r = resolveRoute(node({ type: "feature", complexity: "high", risk: "high" }), ConfigSchema.parse(base));
    expect(r).toMatchObject({ agent: "coder", model: "opus" });
  });

  it("efficiency.test_max_model ile sınır değiştirilebilir", () => {
    const config = ConfigSchema.parse({ ...base, efficiency: { test_max_model: "haiku" } });
    expect(resolveRoute(node({ type: "test", complexity: "med" }), config).model).toBe("haiku");
  });
});
