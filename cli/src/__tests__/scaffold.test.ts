import { describe, expect, it } from "vitest";
import { runScaffold } from "../scaffold.js";
import { ConfigSchema } from "../schema/index.js";
import type { GraphNode } from "../graph/types.js";

const CONFIG = ConfigSchema.parse({
  routing: [{ when: {}, model: "haiku" }],
  escalation: ["haiku"],
  max_attempts_per_model: 1,
  budgets: { default_context: 8000, max_turns: 25 },
  scaffold_commands: { "vite-react": "echo scaffolding" },
});

function scaffoldNode(overrides: Record<string, unknown> = {}): GraphNode {
  return {
    id: "E01-F01-T01",
    kind: "task",
    name: "t",
    filePath: "/tmp/t.md",
    relPath: "t.md",
    body: "",
    epicId: "E01",
    frontmatter: {
      type: "scaffold",
      scaffold_stack: "vite-react",
      ...overrides,
    },
  };
}

describe("runScaffold", () => {
  it("type !== scaffold ise çalıştırmaz", () => {
    const result = runScaffold(scaffoldNode({ type: "feature" }), CONFIG, "/proje");
    expect(result.ran).toBe(false);
    expect(result.skippedReason).toContain("scaffold");
  });

  it("deterministic_scaffold kapalıysa çalıştırmaz (ablasyon)", () => {
    const config = ConfigSchema.parse({
      ...CONFIG,
      optimizations: { deterministic_scaffold: false },
    });
    const result = runScaffold(scaffoldNode(), config, "/proje");
    expect(result.ran).toBe(false);
    expect(result.skippedReason).toContain("kapalı");
  });

  it("scaffold_stack yoksa çalıştırmaz", () => {
    const result = runScaffold(scaffoldNode({ scaffold_stack: undefined }), CONFIG, "/proje");
    expect(result.ran).toBe(false);
  });

  it("scaffold_commands'ta eşleşen komut yoksa çalıştırmaz", () => {
    const result = runScaffold(
      scaffoldNode({ scaffold_stack: "unknown-stack" }),
      CONFIG,
      "/proje",
    );
    expect(result.ran).toBe(false);
    expect(result.skippedReason).toContain("unknown-stack");
  });

  it("her şey tamamsa mock runner ile komutu çalıştırır", () => {
    const calls: { command: string; cwd: string }[] = [];
    const result = runScaffold(scaffoldNode(), CONFIG, "/proje", (command, cwd) => {
      calls.push({ command, cwd });
      return { ok: true, output: "ok" };
    });
    expect(result.ran).toBe(true);
    expect(result.ok).toBe(true);
    expect(calls).toEqual([{ command: "echo scaffolding", cwd: "/proje" }]);
  });

  it("gerçek execSync ile de çalışır (mock yok)", () => {
    const result = runScaffold(scaffoldNode(), CONFIG, process.cwd());
    expect(result.ran).toBe(true);
    expect(result.ok).toBe(true);
    expect(result.output).toContain("scaffolding");
  });
});
