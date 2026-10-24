import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { findDecision, markDecisionOverridden, readDecisions, recordDecision } from "../team/decisionLog.js";
import { parseGraph } from "../graph/parser.js";
import { withTempGraph } from "../testUtils/tempGraph.js";

function epicFrontmatter(id: string, name: string): string {
  const obj = { id, kind: "epic", name, summary: "s", status: "pending", expanded: true };
  const lines = Object.entries(obj).map(([k, v]) => `${k}: ${JSON.stringify(v)}`);
  return `---\n${lines.join("\n")}\n---\n## Epic\nx\n`;
}

describe("recordDecision — roadmap 13.11", () => {
  it("_metrics/decisions.jsonl'e yazar, stabil bir id üretir", () => {
    withTempGraph({ "E01-x/epic.md": epicFrontmatter("E01", "E01-x") }, (graph, dir) => {
      const record = recordDecision(graph, {
        epicId: "E01",
        nodeId: "E01-F01-T03",
        summary: "Sıfırlama token'ına 15 dk sınır",
        decidedBy: "user (Telegram)",
        optionsCount: 3,
      });
      expect(record.id).toBe("E01-F01-T03-D1");
      expect(record.overridden).toBe(false);

      const stored = readDecisions(dir);
      expect(stored).toHaveLength(1);
      expect(stored[0].id).toBe("E01-F01-T03-D1");
    });
  });

  it("epic'in kendi knowledge/<epic>-decisions.md'sine insan-okur satır ekler (oluşturur, çakışma yok)", () => {
    withTempGraph({ "E01-x/epic.md": epicFrontmatter("E01", "E01-x") }, (graph, dir) => {
      recordDecision(graph, {
        epicId: "E01",
        nodeId: "E01-F01-T03",
        summary: "Sıfırlama token'ına 15 dk sınır",
        decidedBy: "user (Telegram)",
        optionsCount: 3,
      });
      const path = join(dir, "E01-x", "knowledge", "e01-decisions.md");
      expect(existsSync(path)).toBe(true);
      const content = readFileSync(path, "utf-8");
      expect(content).toContain("Sıfırlama token'ına 15 dk sınır");
      expect(content).toContain("karar veren: user (Telegram)");
      expect(content).toContain("seçenekler: 3");
    });
  });

  it("aynı graph nesnesiyle İKİNCİ bir karar çağrısı, İLK kararı EZMEZ (stale-cache koruması)", () => {
    withTempGraph({ "E01-x/epic.md": epicFrontmatter("E01", "E01-x") }, (graph, dir) => {
      recordDecision(graph, {
        epicId: "E01",
        nodeId: "E01-F01-T01",
        summary: "Birinci karar",
        decidedBy: "manager",
        optionsCount: 2,
      });
      recordDecision(graph, {
        epicId: "E01",
        nodeId: "E01-F01-T02",
        summary: "İkinci karar",
        decidedBy: "manager",
        optionsCount: 2,
      });

      const path = join(dir, "E01-x", "knowledge", "e01-decisions.md");
      const content = readFileSync(path, "utf-8");
      expect(content).toContain("Birinci karar");
      expect(content).toContain("İkinci karar");

      expect(readDecisions(dir)).toHaveLength(2);
    });
  });

  it("farklı epic'ler farklı decisions knowledge node'una yazar (ID çakışması yok)", () => {
    withTempGraph(
      {
        "E01-x/epic.md": epicFrontmatter("E01", "E01-x"),
        "E02-y/epic.md": epicFrontmatter("E02", "E02-y"),
      },
      (graph, dir) => {
        recordDecision(graph, { epicId: "E01", nodeId: "E01-F01-T01", summary: "A", decidedBy: "manager", optionsCount: 1 });
        recordDecision(graph, { epicId: "E02", nodeId: "E02-F01-T01", summary: "B", decidedBy: "manager", optionsCount: 1 });

        expect(existsSync(join(dir, "E01-x", "knowledge", "e01-decisions.md"))).toBe(true);
        expect(existsSync(join(dir, "E02-y", "knowledge", "e02-decisions.md"))).toBe(true);
        // Her iki dosya da gerçek bir graph parse'ında İSİM/ID ÇAKIŞMASI üretmemeli.
        const reparsed = parseGraph(dir);
        expect(reparsed.parseErrors).toEqual([]);
      },
    );
  });
});

describe("findDecision / markDecisionOverridden — roadmap 13.11 (/override)", () => {
  it("findDecision var olan bir id'yi bulur, olmayanı null döner", () => {
    withTempGraph({ "E01-x/epic.md": epicFrontmatter("E01", "E01-x") }, (graph, dir) => {
      const record = recordDecision(graph, {
        epicId: "E01",
        nodeId: "E01-F01-T01",
        summary: "x",
        decidedBy: "manager",
        optionsCount: 1,
      });
      expect(findDecision(dir, record.id)?.summary).toBe("x");
      expect(findDecision(dir, "YOK-D1")).toBeNull();
    });
  });

  it("markDecisionOverridden kaydı overridden:true yapar, diğerlerine dokunmaz", () => {
    withTempGraph({ "E01-x/epic.md": epicFrontmatter("E01", "E01-x") }, (graph, dir) => {
      const d1 = recordDecision(graph, { epicId: "E01", nodeId: "E01-F01-T01", summary: "a", decidedBy: "manager", optionsCount: 1 });
      const d2 = recordDecision(graph, { epicId: "E01", nodeId: "E01-F01-T02", summary: "b", decidedBy: "manager", optionsCount: 1 });

      expect(markDecisionOverridden(dir, d1.id)).toBe(true);
      expect(findDecision(dir, d1.id)?.overridden).toBe(true);
      expect(findDecision(dir, d2.id)?.overridden).toBe(false);
    });
  });

  it("var olmayan bir id için false döner, çökmez", () => {
    withTempGraph({ "E01-x/epic.md": epicFrontmatter("E01", "E01-x") }, (_graph, dir) => {
      expect(markDecisionOverridden(dir, "YOK-D1")).toBe(false);
    });
  });
});
