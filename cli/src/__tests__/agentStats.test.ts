import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { computeAgentStats } from "../agentStats.js";

describe("computeAgentStats", () => {
  it("tools/disallowedTools ve tüm dosya için token tahmini üretir", () => {
    const dir = mkdtempSync(join(tmpdir(), "gp-agent-stats-"));
    try {
      writeFileSync(
        join(dir, "docs.md"),
        "---\ntools: Read, Edit, Write\ndisallowedTools: Bash\n---\n\nTalimat metni.\n",
      );
      const stats = computeAgentStats(dir);
      expect(stats).toHaveLength(1);
      expect(stats[0].name).toBe("docs");
      expect(stats[0].tools).toBe("Read, Edit, Write");
      expect(stats[0].disallowedTools).toBe("Bash");
      expect(stats[0].toolDefTokens).toBeGreaterThan(0);
      expect(stats[0].totalTokens).toBeGreaterThan(stats[0].toolDefTokens);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("gerçek plugin/agents/ dizininde 4 agent bulur, hepsi tools alanına sahip", () => {
    const agentsDir = join(process.cwd(), "..", "plugin", "agents");
    const stats = computeAgentStats(agentsDir);
    expect(stats.length).toBeGreaterThanOrEqual(4);
    expect(stats.every((s) => s.tools.length > 0)).toBe(true);
  });
});
