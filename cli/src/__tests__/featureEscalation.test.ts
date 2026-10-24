import { readFileSync } from "node:fs";
import matter from "gray-matter";
import { describe, expect, it } from "vitest";
import {
  maybePreemptivelyEscalateFeature,
  preemptivelyAssignRemainingToSenior,
  shouldPreemptivelyEscalateFeature,
} from "../team/featureEscalation.js";
import { recordMisTag } from "../team/tagging.js";
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

describe("shouldPreemptivelyEscalateFeature — roadmap 13.5", () => {
  it("son 2 kayıt ikisi de underestimated ise true döner", () => {
    withTempGraph({ "a.md": frontmatter(TASK({ id: "E01-F01-T01", name: "a" })) }, (_graph, dir) => {
      recordMisTag(dir, { nodeId: "E01-F01-T01", direction: "underestimated", reason: "x" });
      recordMisTag(dir, { nodeId: "E01-F01-T02", direction: "underestimated", reason: "x" });
      expect(shouldPreemptivelyEscalateFeature(dir, "E01-F01")).toBe(true);
    });
  });

  it("son 2 kayıttan biri overestimated ise false döner", () => {
    withTempGraph({ "a.md": frontmatter(TASK({ id: "E01-F01-T01", name: "a" })) }, (_graph, dir) => {
      recordMisTag(dir, { nodeId: "E01-F01-T01", direction: "underestimated", reason: "x" });
      recordMisTag(dir, { nodeId: "E01-F01-T02", direction: "overestimated", reason: "x" });
      expect(shouldPreemptivelyEscalateFeature(dir, "E01-F01")).toBe(false);
    });
  });

  it("2'den az kayıt varsa false döner", () => {
    withTempGraph({ "a.md": frontmatter(TASK({ id: "E01-F01-T01", name: "a" })) }, (_graph, dir) => {
      recordMisTag(dir, { nodeId: "E01-F01-T01", direction: "underestimated", reason: "x" });
      expect(shouldPreemptivelyEscalateFeature(dir, "E01-F01")).toBe(false);
    });
  });

  it("başka feature'ın kayıtları sayılmaz", () => {
    withTempGraph({ "a.md": frontmatter(TASK({ id: "E01-F01-T01", name: "a" })) }, (_graph, dir) => {
      recordMisTag(dir, { nodeId: "E01-F02-T01", direction: "underestimated", reason: "x" });
      recordMisTag(dir, { nodeId: "E01-F02-T02", direction: "underestimated", reason: "x" });
      expect(shouldPreemptivelyEscalateFeature(dir, "E01-F01")).toBe(false);
    });
  });
});

describe("preemptivelyAssignRemainingToSenior", () => {
  it("feature'ın pending görevlerini assignee:senior yapar, diğer feature'a dokunmaz", () => {
    withTempGraph(
      {
        "a.md": frontmatter(TASK({ id: "E01-F01-T01", name: "a", status: "pending" })),
        "b.md": frontmatter(TASK({ id: "E01-F01-T02", name: "b", status: "done" })), // done — dokunulmaz
        "c.md": frontmatter(TASK({ id: "E01-F02-T01", name: "c", status: "pending" })), // başka feature
      },
      (graph, dir) => {
        const result = preemptivelyAssignRemainingToSenior(graph, "E01-F01");
        expect(result).toEqual({ triggered: true, assignedNodeIds: ["E01-F01-T01"] });

        const a = matter(readFileSync(`${dir}/a.md`, "utf-8"));
        expect(a.data.assignee).toBe("senior");
        const b = matter(readFileSync(`${dir}/b.md`, "utf-8"));
        expect(b.data.assignee).toBeUndefined();
        const c = matter(readFileSync(`${dir}/c.md`, "utf-8"));
        expect(c.data.assignee).toBeUndefined();
      },
    );
  });

  it("hiç etkilenecek görev yoksa triggered:false döner", () => {
    withTempGraph(
      { "a.md": frontmatter(TASK({ id: "E01-F01-T01", name: "a", status: "done" })) },
      (graph) => {
        expect(preemptivelyAssignRemainingToSenior(graph, "E01-F01")).toEqual({
          triggered: false,
          assignedNodeIds: [],
        });
      },
    );
  });
});

describe("maybePreemptivelyEscalateFeature", () => {
  it("koşul karşılanmazsa hiçbir şey yapmaz", () => {
    withTempGraph(
      { "a.md": frontmatter(TASK({ id: "E01-F01-T01", name: "a", status: "pending" })) },
      (graph, dir) => {
        expect(maybePreemptivelyEscalateFeature(graph, dir, "E01-F01")).toEqual({
          triggered: false,
          assignedNodeIds: [],
        });
      },
    );
  });

  it("koşul karşılanırsa gerçekten atar", () => {
    withTempGraph(
      { "a.md": frontmatter(TASK({ id: "E01-F01-T01", name: "a", status: "pending" })) },
      (graph, dir) => {
        recordMisTag(dir, { nodeId: "E01-F01-T05", direction: "underestimated", reason: "x" });
        recordMisTag(dir, { nodeId: "E01-F01-T06", direction: "underestimated", reason: "x" });
        const result = maybePreemptivelyEscalateFeature(graph, dir, "E01-F01");
        expect(result.triggered).toBe(true);
        expect(result.assignedNodeIds).toEqual(["E01-F01-T01"]);
      },
    );
  });
});
