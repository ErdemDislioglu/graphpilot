import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { initGraph } from "../init.js";
import { parseGraph } from "../graph/parser.js";
import { ConfigSchema } from "../schema/index.js";

describe("initGraph", () => {
  it("var olmayan .graph/ için brief.md + config.yml oluşturur", () => {
    const dir = mkdtempSync(join(tmpdir(), "gp-init-test-"));
    try {
      const graphDir = join(dir, ".graph");
      const result = initGraph(graphDir);
      expect(result.created.length).toBe(2);
      expect(result.skipped).toEqual([]);
      expect(existsSync(join(graphDir, "brief.md"))).toBe(true);
      expect(existsSync(join(graphDir, "config.yml"))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("üretilen config.yml ConfigSchema'dan hatasız geçer", () => {
    const dir = mkdtempSync(join(tmpdir(), "gp-init-test-"));
    try {
      const graphDir = join(dir, ".graph");
      initGraph(graphDir);
      const graph = parseGraph(graphDir);
      expect(ConfigSchema.safeParse(graph.rawConfig).success).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("idempotent: zaten var olan dosyaların üzerine yazmaz", () => {
    const dir = mkdtempSync(join(tmpdir(), "gp-init-test-"));
    try {
      const graphDir = join(dir, ".graph");
      initGraph(graphDir);
      const briefPath = join(graphDir, "brief.md");
      const customContent = "## Amaç\n\nBENİM ÖZEL İÇERİĞİM\n";
      writeFileSync(briefPath, customContent);

      const second = initGraph(graphDir);
      expect(second.skipped).toContain(briefPath);
      expect(readFileSync(briefPath, "utf-8")).toBe(customContent);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
