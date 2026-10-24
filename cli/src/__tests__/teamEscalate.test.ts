import { readFileSync } from "node:fs";
import matter from "gray-matter";
import { describe, expect, it } from "vitest";
import { escalateTeamNode } from "../team/teamEscalate.js";
import { readMisTagRecords } from "../team/tagging.js";
import { ConfigSchema } from "../schema/index.js";
import { withTempGraph } from "../testUtils/tempGraph.js";

const TASK = (overrides: Record<string, unknown>) => ({
  id: "E01-F01-T01",
  kind: "task",
  name: "a",
  level: 3,
  summary: "s",
  type: "feature",
  complexity: "low",
  risk: "low",
  context_size: "small",
  model: "haiku",
  agent: "coder",
  context_budget: 8000,
  status: "pending",
  attempts: 0,
  ...overrides,
});

function frontmatter(obj: Record<string, unknown>): string {
  const lines = Object.entries(obj).map(([k, v]) => `${k}: ${JSON.stringify(v)}`);
  return `---\n${lines.join("\n")}\n---\n## Görev\nx\n\n## Hata geçmişi\n\n*(yok)*\n`;
}

const CONFIG = ConfigSchema.parse({
  routing: [{ when: {}, model: "haiku" }],
  escalation: ["haiku", "sonnet", "opus"],
  max_attempts_per_model: 1,
  budgets: { default_context: 8000, max_turns: 25 },
  team: { enabled: true },
});

describe("escalateTeamNode — roadmap 13.5", () => {
  it("junior(haiku) → junior(sonnet)", () => {
    withTempGraph({ "a.md": frontmatter(TASK({ model: "haiku" })) }, (graph, dir) => {
      const result = escalateTeamNode(graph, "E01-F01-T01", CONFIG);
      expect(result).toEqual({
        escalated: true,
        fromRole: "junior",
        toRole: "junior",
        fromModel: "haiku",
        toModel: "sonnet",
      });
      const after = matter(readFileSync(`${dir}/a.md`, "utf-8"));
      expect(after.data.assignee).toBe("junior");
      expect(after.data.model).toBe("sonnet");
    });
  });

  it("junior(sonnet) → senior, mis_tagged:underestimated kaydedilir", () => {
    withTempGraph({ "a.md": frontmatter(TASK({ model: "sonnet" })) }, (graph, dir) => {
      const result = escalateTeamNode(graph, "E01-F01-T01", CONFIG);
      expect(result).toEqual({
        escalated: true,
        fromRole: "junior",
        toRole: "senior",
        fromModel: "sonnet",
        toModel: "opus",
      });
      const after = matter(readFileSync(`${dir}/a.md`, "utf-8"));
      expect(after.data.assignee).toBe("senior");

      const misTags = readMisTagRecords(dir);
      expect(misTags).toHaveLength(1);
      expect(misTags[0]).toMatchObject({ nodeId: "E01-F01-T01", direction: "underestimated" });
    });
  });

  it("tester(haiku) → tester(sonnet=upgrade_to), senior'a İLERLEMEZ", () => {
    withTempGraph(
      { "a.md": frontmatter(TASK({ type: "test", model: "haiku" })) },
      (graph, dir) => {
        const result = escalateTeamNode(graph, "E01-F01-T01", CONFIG);
        expect(result).toEqual({
          escalated: true,
          fromRole: "tester",
          toRole: "tester",
          fromModel: "haiku",
          toModel: "sonnet",
        });
        const after = matter(readFileSync(`${dir}/a.md`, "utf-8"));
        expect(after.data.assignee).toBe("tester");
        expect(after.data.model).toBe("sonnet");
      },
    );
  });

  it("tester zincirinin sonunda (sonnet) daha ileri gitmez", () => {
    withTempGraph({ "a.md": frontmatter(TASK({ type: "test", model: "sonnet" })) }, (graph) => {
      const result = escalateTeamNode(graph, "E01-F01-T01", CONFIG);
      expect(result.escalated).toBe(false);
      expect(result.toRole).toBe("tester");
    });
  });

  it("senior zaten en üstteyse daha ileri gitmez", () => {
    withTempGraph(
      { "a.md": frontmatter(TASK({ complexity: "high", model: "opus", agent: "senior" })) },
      (graph) => {
        const result = escalateTeamNode(graph, "E01-F01-T01", CONFIG);
        expect(result.escalated).toBe(false);
        expect(result.toRole).toBe("senior");
      },
    );
  });

  it("düğüm bulunamazsa anlamlı hata döner, çökmez", () => {
    withTempGraph({ "a.md": frontmatter(TASK({})) }, (graph) => {
      const result = escalateTeamNode(graph, "YOK-F01-T01", CONFIG);
      expect(result.escalated).toBe(false);
      expect(result.reason).toContain("bulunamadı");
    });
  });
});
