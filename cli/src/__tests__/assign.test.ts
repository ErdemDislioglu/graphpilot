import { describe, expect, it } from "vitest";
import { resolveAssignment } from "../team/assign.js";
import { ConfigSchema } from "../schema/index.js";
import type { GraphNode } from "../graph/types.js";

const CONFIG = ConfigSchema.parse({
  routing: [{ when: {}, model: "haiku" }],
  escalation: ["haiku", "sonnet", "opus"],
  max_attempts_per_model: 1,
  budgets: { default_context: 8000, max_turns: 25 },
  team: { enabled: true },
});

function node(frontmatter: Record<string, unknown>): GraphNode {
  return {
    id: "E01-F01-T01",
    kind: "task",
    name: "a",
    filePath: "/tmp/a.md",
    relPath: "a.md",
    frontmatter,
    body: "",
    epicId: "E01",
  };
}

describe("resolveAssignment — roadmap 13.3 tablosu", () => {
  it("complexity: high → senior (opus)", () => {
    const result = resolveAssignment(node({ complexity: "high" }), CONFIG);
    expect(result).toEqual({ role: "senior", model: "opus", agent: "senior" });
  });

  it("type: refactor + context_size: large → senior", () => {
    const result = resolveAssignment(
      node({ complexity: "low", type: "refactor", context_size: "large" }),
      CONFIG,
    );
    expect(result.role).toBe("senior");
  });

  it("tags içinde 'security' → senior (complexity düşük olsa bile)", () => {
    const result = resolveAssignment(node({ complexity: "low", tags: ["security"] }), CONFIG);
    expect(result.role).toBe("senior");
  });

  it("tags içinde 'architecture'/'data_model'/'integration' → senior", () => {
    for (const tag of ["architecture", "data_model", "integration"]) {
      expect(resolveAssignment(node({ complexity: "low", tags: [tag] }), CONFIG).role).toBe(
        "senior",
      );
    }
  });

  it("complexity: med → junior (sonnet)", () => {
    const result = resolveAssignment(node({ complexity: "med" }), CONFIG);
    expect(result).toEqual({ role: "junior", model: "sonnet", agent: "coder" });
  });

  it("complexity: low → junior (haiku)", () => {
    const result = resolveAssignment(node({ complexity: "low" }), CONFIG);
    expect(result).toEqual({ role: "junior", model: "haiku", agent: "coder" });
  });

  it("type: test → tester (complexity ne olursa olsun)", () => {
    const result = resolveAssignment(node({ complexity: "high", type: "test" }), CONFIG);
    expect(result).toEqual({ role: "tester", model: "haiku", agent: "tester" });
  });

  it("type: docs → docs", () => {
    const result = resolveAssignment(node({ complexity: "low", type: "docs" }), CONFIG);
    expect(result).toEqual({ role: "docs", model: "haiku", agent: "docs" });
  });

  it("assignee: senior tabloyu ELLE ezer (complexity low olsa bile)", () => {
    const result = resolveAssignment(node({ complexity: "low", assignee: "senior" }), CONFIG);
    expect(result.role).toBe("senior");
  });

  it("assignee: junior tabloyu ezer (complexity high olsa bile, tablo senior derdi)", () => {
    const result = resolveAssignment(node({ complexity: "high", assignee: "junior" }), CONFIG);
    expect(result.role).toBe("junior");
  });
});

describe("resolveAssignment — Faz 14 O2 test_max_model", () => {
  it("risk: high test görevi tester'a gider; elle opus verilse bile sonnet'e iner", () => {
    const result = resolveAssignment(node({ type: "test", risk: "high", complexity: "high", model: "opus" }), CONFIG);
    expect(result).toEqual({ role: "tester", model: "sonnet", agent: "tester" });
  });
});
