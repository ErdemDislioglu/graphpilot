import { describe, expect, it } from "vitest";
import { computeDeadlockReport } from "../deadlock.js";
import { withTempGraph } from "../testUtils/tempGraph.js";

const TASK = (overrides: Record<string, unknown>) => ({
  kind: "task",
  level: 3,
  summary: "s",
  type: "feature",
  complexity: "low",
  risk: "low",
  context_size: "small",
  model: "auto",
  agent: "auto",
  context_budget: 8000,
  status: "pending",
  attempts: 0,
  ...overrides,
});

function frontmatter(obj: Record<string, unknown>): string {
  const lines = Object.entries(obj).map(([k, v]) => `${k}: ${JSON.stringify(v)}`);
  return `---\n${lines.join("\n")}\n---\n## Görev\nx\n`;
}

describe("computeDeadlockReport", () => {
  it("A bir failed B'ye bağımlıysa ve hiçbir şey running değilse: deadlock, kök sebep gösterilir", () => {
    withTempGraph(
      {
        "a.md": frontmatter(TASK({ id: "E01-F01-T01", name: "a", status: "failed" })),
        "b.md": frontmatter(
          TASK({ id: "E01-F01-T02", name: "b", depends_on: ["E01-F01-T01"] }),
        ),
      },
      (graph) => {
        const report = computeDeadlockReport(graph);
        expect(report).toEqual({
          isDeadlocked: true,
          reasons: [{ nodeId: "E01-F01-T02", blockedBy: "E01-F01-T01", blockerStatus: "failed" }],
        });
      },
    );
  });

  it("running bir task varsa deadlock SAYILMAZ (ilerleme sürüyor)", () => {
    withTempGraph(
      {
        "a.md": frontmatter(TASK({ id: "E01-F01-T01", name: "a", status: "running" })),
        "b.md": frontmatter(
          TASK({ id: "E01-F01-T02", name: "b", depends_on: ["E01-F01-T01"] }),
        ),
      },
      (graph) => {
        expect(computeDeadlockReport(graph).isDeadlocked).toBe(false);
      },
    );
  });

  it("ready task varsa deadlock değil", () => {
    withTempGraph(
      { "a.md": frontmatter(TASK({ id: "E01-F01-T01", name: "a" })) },
      (graph) => {
        expect(computeDeadlockReport(graph).isDeadlocked).toBe(false);
      },
    );
  });

  it("hiç blocked task yoksa (hepsi done) deadlock değil", () => {
    withTempGraph(
      { "a.md": frontmatter(TASK({ id: "E01-F01-T01", name: "a", status: "done" })) },
      (graph) => {
        expect(computeDeadlockReport(graph).isDeadlocked).toBe(false);
      },
    );
  });
});

describe("computeDeadlockReport — status: blocked (failNode'un işaretlediği bağımlılar)", () => {
  it("skipped bir göreve bağlı 'blocked' görev deadlock sayılır (eskiden görünmüyordu, otopilot sessizce takılıyordu)", () => {
    withTempGraph(
      {
        "a.md": frontmatter(TASK({ id: "E01-F01-T01", name: "a", status: "skipped" })),
        "b.md": frontmatter(TASK({ id: "E01-F01-T02", name: "b", status: "blocked", depends_on: ["E01-F01-T01"] })),
      },
      (graph) => {
        const report = computeDeadlockReport(graph);
        expect(report.isDeadlocked).toBe(true);
        expect(report.reasons).toEqual([{ nodeId: "E01-F01-T02", blockedBy: "E01-F01-T01", blockerStatus: "skipped" }]);
      },
    );
  });
});
