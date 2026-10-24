import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { runDoctor } from "../doctor.js";
import { initGraph } from "../init.js";

describe("runDoctor", () => {
  it(".graph/ yoksa graph-dir hatası raporlar, orada durur", () => {
    const checks = runDoctor("/kesinlikle/yok/boyle/bir/yol/.graph");
    const graphCheck = checks.find((c) => c.name === "graph-dir");
    expect(graphCheck?.ok).toBe(false);
    expect(checks.find((c) => c.name === "brief")).toBeUndefined(); // erken çıkış
  });

  it("node-version her zaman raporlanır ve >=22 ise ok", () => {
    const checks = runDoctor("/kesinlikle/yok");
    const nodeCheck = checks.find((c) => c.name === "node-version");
    expect(nodeCheck?.ok).toBe(true); // bu ortamda Node 22
  });

  it("gp init sonrası tüm kontroller ok", () => {
    const dir = mkdtempSync(join(tmpdir(), "gp-doctor-test-"));
    try {
      const graphDir = join(dir, ".graph");
      initGraph(graphDir);
      const checks = runDoctor(graphDir);
      expect(checks.every((c) => c.ok)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
