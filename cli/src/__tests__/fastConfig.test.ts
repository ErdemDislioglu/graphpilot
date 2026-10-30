import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { graphDirFor, loadFastConfig } from "../hooks/fastConfig.js";

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "gp-fastconfig-test-"));
}

describe("loadFastConfig — Faz 7.3, 9.6 kapsam eksiği (önceden sadece alt süreçle test edilmişti)", () => {
  it(".graph yoksa graphDirExists:false + varsayılan optimizations döner", () => {
    const dir = tempDir();
    try {
      expect(loadFastConfig(dir)).toEqual({
        graphDirExists: false,
        optimizations: {
          cache_friendly_order: true,
          log_trimming: true,
          tool_restriction: true,
          batch_low_nodes: true,
          deterministic_scaffold: true,
          turn_limits: true,
          repo_map: true,
        },
        efficiency: expect.objectContaining({ run_clear_warn_tokens: 70000 }),
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it(".graph var ama config.yml yoksa graphDirExists:true + varsayılan optimizations", () => {
    const dir = tempDir();
    try {
      mkdirSync(join(dir, ".graph"));
      const result = loadFastConfig(dir);
      expect(result.graphDirExists).toBe(true);
      expect(result.optimizations.log_trimming).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("config.yml'deki optimizations gerçekten okunur", () => {
    const dir = tempDir();
    try {
      mkdirSync(join(dir, ".graph"));
      writeFileSync(
        join(dir, ".graph", "config.yml"),
        [
          "routing: [{ when: {}, model: haiku }]",
          "escalation: [haiku]",
          "max_attempts_per_model: 1",
          "budgets: { default_context: 8000, max_turns: 25 }",
          "optimizations: { log_trimming: false, turn_limits: false }",
        ].join("\n"),
      );
      const result = loadFastConfig(dir);
      expect(result.optimizations.log_trimming).toBe(false);
      expect(result.optimizations.turn_limits).toBe(false);
      expect(result.optimizations.repo_map).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("config.yml bozuk YAML ise çökmez, varsayılana düşer", () => {
    const dir = tempDir();
    try {
      mkdirSync(join(dir, ".graph"));
      writeFileSync(join(dir, ".graph", "config.yml"), "routing: [bozuk: : yaml:::");
      const result = loadFastConfig(dir);
      expect(result.graphDirExists).toBe(true);
      expect(result.optimizations.log_trimming).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("config.yml şema dışıysa (ör. routing yok) varsayılana düşer", () => {
    const dir = tempDir();
    try {
      mkdirSync(join(dir, ".graph"));
      writeFileSync(join(dir, ".graph", "config.yml"), "sadece: bir alan\n");
      const result = loadFastConfig(dir);
      expect(result.optimizations.log_trimming).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("graphDirFor", () => {
  it("cwd + .graph birleştirir", () => {
    expect(graphDirFor("/proj")).toBe(join("/proj", ".graph"));
  });
});
