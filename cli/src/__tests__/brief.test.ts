import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { setBrief } from "../brief.js";
import { initGraph } from "../init.js";

describe("setBrief", () => {
  it("gp init'in placeholder brief.md'sinin üzerine GERÇEK içerikle yazar", () => {
    const dir = mkdtempSync(join(tmpdir(), "gp-brief-test-"));
    try {
      const graphDir = join(dir, ".graph");
      initGraph(graphDir); // placeholder brief.md oluşturur
      const sourcePath = join(dir, "real-brief.md");
      const realContent = "## Amaç\n\nGerçek proje açıklaması.\n";
      writeFileSync(sourcePath, realContent);

      setBrief(graphDir, sourcePath);

      expect(readFileSync(join(graphDir, "brief.md"), "utf-8")).toBe(realContent);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it(".graph/ henüz yoksa bile çalışır (mkdir recursive)", () => {
    const dir = mkdtempSync(join(tmpdir(), "gp-brief-test-"));
    try {
      const graphDir = join(dir, ".graph");
      const sourcePath = join(dir, "real-brief.md");
      writeFileSync(sourcePath, "## Amaç\n\nX\n");
      setBrief(graphDir, sourcePath);
      expect(existsSync(join(graphDir, "brief.md"))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
