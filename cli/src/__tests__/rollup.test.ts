import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseGraph } from "../graph/parser.js";
import { applyRollup, computeRollup } from "../rollup.js";
import { withTempGraph } from "../testUtils/tempGraph.js";

const EPIC = (id: string, status = "pending", expanded = true) =>
  `---\nid: ${id}\nkind: epic\nname: ${id}\nsummary: "özet, tırnaklı"\nstatus: ${status}\nexpanded: ${expanded}\ndepends_on: []\ndraft: false\n---\n## Amaç\nx\n`;

const FEATURE = (id: string, status = "pending", expanded = true) =>
  `---\nid: ${id}\nkind: feature\nname: ${id}\nsummary: s\nstatus: ${status}\nexpanded: ${expanded}\ndepends_on: []\ndraft: false\n---\n`;

const TASK = (id: string, status: string) =>
  `---\nid: ${id}\nkind: task\nname: ${id}\nlevel: 3\nsummary: s\ntype: feature\ncomplexity: low\nrisk: low\ncontext_size: small\nmodel: auto\nagent: auto\ncontext_budget: 1000\nstatus: ${status}\nattempts: 0\n---\n`;

describe("computeRollup — Faz 14 B2", () => {
  it("tüm task'lar done ise feature ve epic done'a çekilir (pilot: 9 pending kalıyordu)", () => {
    withTempGraph(
      {
        "e/epic.md": EPIC("E01"),
        "e/f1.md": FEATURE("E01-F01"),
        "e/f2.md": FEATURE("E01-F02", "running"),
        "e/t1.md": TASK("E01-F01-T01", "done"),
        "e/t2.md": TASK("E01-F02-T01", "done"),
      },
      (graph) => {
        expect(computeRollup(graph)).toEqual([
          { id: "E01", from: "pending", to: "done" },
          { id: "E01-F01", from: "pending", to: "done" },
          { id: "E01-F02", from: "running", to: "done" },
        ]);
      },
    );
  });

  it("bitmemiş feature değişmez; epic de bitmez", () => {
    withTempGraph(
      {
        "e/epic.md": EPIC("E01"),
        "e/f1.md": FEATURE("E01-F01"),
        "e/f2.md": FEATURE("E01-F02"),
        "e/t1.md": TASK("E01-F01-T01", "done"),
        "e/t2.md": TASK("E01-F02-T01", "pending"),
      },
      (graph) => {
        expect(computeRollup(graph)).toEqual([{ id: "E01-F01", from: "pending", to: "done" }]);
      },
    );
  });

  it("B3 ile tutarlı: genişletilmemiş feature varken epic done olmaz", () => {
    withTempGraph(
      {
        "e/epic.md": EPIC("E02"),
        "e/f1.md": FEATURE("E02-F01"),
        "e/f2.md": FEATURE("E02-F02", "pending", false),
        "e/t1.md": TASK("E02-F01-T01", "done"),
      },
      (graph) => {
        expect(computeRollup(graph)).toEqual([{ id: "E02-F01", from: "pending", to: "done" }]);
      },
    );
  });

  it("done yazan ama artık bitmemiş düğüm pending'e döner (sonradan task eklendi)", () => {
    withTempGraph(
      {
        "e/epic.md": EPIC("E01", "done"),
        "e/f1.md": FEATURE("E01-F01", "done"),
        "e/t1.md": TASK("E01-F01-T01", "done"),
        "e/t2.md": TASK("E01-F01-T02", "pending"),
      },
      (graph) => {
        expect(computeRollup(graph)).toEqual([
          { id: "E01", from: "done", to: "pending" },
          { id: "E01-F01", from: "done", to: "pending" },
        ]);
      },
    );
  });

  it("failed/blocked/needs_decision/skipped durumlarına dokunmaz", () => {
    withTempGraph(
      {
        "e/epic.md": EPIC("E01", "needs_decision"),
        "e/f1.md": FEATURE("E01-F01", "blocked"),
        "e/f2.md": FEATURE("E01-F02", "skipped"),
        "e/t1.md": TASK("E01-F01-T01", "done"),
        "e/t2.md": TASK("E01-F02-T01", "done"),
      },
      (graph) => {
        expect(computeRollup(graph)).toEqual([]);
      },
    );
  });

  it("değişiklik yoksa boş liste döner", () => {
    withTempGraph(
      { "e/epic.md": EPIC("E01"), "e/f1.md": FEATURE("E01-F01", "pending", false) },
      (graph) => {
        expect(computeRollup(graph)).toEqual([]);
      },
    );
  });
});

describe("applyRollup", () => {
  it("yalnız status satırını değiştirir; frontmatter biçimi ve gövde korunur", () => {
    withTempGraph(
      {
        "e/epic.md": EPIC("E01"),
        "e/f1.md": FEATURE("E01-F01"),
        "e/t1.md": TASK("E01-F01-T01", "done"),
      },
      (graph, dir) => {
        const changes = applyRollup(graph);
        expect(changes.map((c) => c.id)).toEqual(["E01", "E01-F01"]);
        expect(readFileSync(join(dir, "e/epic.md"), "utf-8")).toBe(
          EPIC("E01").replace("status: pending", "status: done"),
        );
        const fresh = parseGraph(dir);
        expect(fresh.nodesById.get("E01")!.frontmatter.status).toBe("done");
        expect(fresh.nodesById.get("E01-F01")!.frontmatter.status).toBe("done");
        expect(computeRollup(fresh)).toEqual([]);
      },
    );
  });
});
