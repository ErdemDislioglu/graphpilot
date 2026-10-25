import { describe, expect, it } from "vitest";
import { computeEpicDone, computeFeatureDone } from "../epicStatus.js";
import { withTempGraph } from "../testUtils/tempGraph.js";

const EPIC = (id: string, status = "pending") =>
  `---\nid: ${id}\nkind: epic\nname: ${id}\nsummary: s\nstatus: ${status}\nexpanded: true\ndepends_on: []\ndraft: false\n---\n`;

const TASK = (id: string, status: string) =>
  `---\nid: ${id}\nkind: task\nname: ${id}\nlevel: 3\nsummary: s\ntype: feature\ncomplexity: low\nrisk: low\ncontext_size: small\nmodel: auto\nagent: auto\ncontext_budget: 1000\nstatus: ${status}\nattempts: 0\n---\n`;

const FEATURE = (id: string, status = "pending") =>
  `---\nid: ${id}\nkind: feature\nname: ${id}\nsummary: s\nstatus: ${status}\nexpanded: true\ndepends_on: []\ndraft: false\n---\n`;

describe("computeEpicDone", () => {
  it("tüm task'lar done ise epic done:true", () => {
    withTempGraph(
      {
        "e/epic.md": EPIC("E01"),
        "e/t1.md": TASK("E01-F01-T01", "done"),
        "e/t2.md": TASK("E01-F01-T02", "done"),
      },
      (graph) => {
        const result = computeEpicDone(graph, "E01");
        expect(result).toEqual({ epicId: "E01", done: true, total: 2, doneCount: 2 });
      },
    );
  });

  it("bir task hâlâ pending ise done:false", () => {
    withTempGraph(
      {
        "e/epic.md": EPIC("E01"),
        "e/t1.md": TASK("E01-F01-T01", "done"),
        "e/t2.md": TASK("E01-F01-T02", "pending"),
      },
      (graph) => {
        expect(computeEpicDone(graph, "E01").done).toBe(false);
      },
    );
  });

  it("epic'in hiç task'ı yoksa done:false (boş epic 'bitti' sayılmaz)", () => {
    withTempGraph({ "e/epic.md": EPIC("E01") }, (graph) => {
      expect(computeEpicDone(graph, "E01").done).toBe(false);
    });
  });

  it("Faz 8 pilot koşusunda bulunan gerçek bug — feature status: pending kalsa bile, " +
    "tüm task'lar done ise epic done:true (hiçbir mekanizma feature'ı otomatik done'a çevirmez)", () => {
    withTempGraph(
      {
        "e/epic.md": EPIC("E01"),
        "e/f1.md": FEATURE("E01-F01", "pending"),
        "e/t1.md": TASK("E01-F01-T01", "done"),
        "e/t2.md": TASK("E01-F01-T02", "done"),
      },
      (graph) => {
        const result = computeEpicDone(graph, "E01");
        expect(result).toEqual({ epicId: "E01", done: true, total: 2, doneCount: 2 });
      },
    );
  });

  it("Faz 14 B3 (pilot): genişletilmemiş bir feature varken mevcut task'lar bitse de done:false", () => {
    withTempGraph(
      {
        "e/epic.md": EPIC("E02"),
        "e/f1.md": FEATURE("E02-F01"),
        "e/t1.md": TASK("E02-F01-T01", "done"),
        "e/f2.md": FEATURE("E02-F02").replace("expanded: true", "expanded: false"),
      },
      (graph) => {
        expect(computeEpicDone(graph, "E02")).toEqual({
          epicId: "E02",
          done: false,
          total: 1,
          doneCount: 1,
        });
      },
    );
  });

  it("Faz 14 B3: epic'in kendisi expanded:false ise done:false", () => {
    withTempGraph(
      {
        "e/epic.md": EPIC("E01").replace("expanded: true", "expanded: false"),
        "e/t1.md": TASK("E01-F01-T01", "done"),
      },
      (graph) => {
        expect(computeEpicDone(graph, "E01").done).toBe(false);
      },
    );
  });
});

describe("computeFeatureDone — 2026-10-25, gerçek bir test projesinde bulunan bug", () => {
  it("doğrudan çocuğu olan tüm task'lar done ise feature done:true", () => {
    withTempGraph(
      {
        "e/epic.md": EPIC("E01"),
        "e/f1.md": FEATURE("E01-F01"),
        "e/t1.md": TASK("E01-F01-T01", "done"),
        "e/t2.md": TASK("E01-F01-T02", "done"),
      },
      (graph) => {
        const result = computeFeatureDone(graph, "E01-F01");
        expect(result).toEqual({ featureId: "E01-F01", done: true, total: 2, doneCount: 2 });
      },
    );
  });

  it("bir task hâlâ pending ise done:false", () => {
    withTempGraph(
      {
        "e/epic.md": EPIC("E01"),
        "e/f1.md": FEATURE("E01-F01"),
        "e/t1.md": TASK("E01-F01-T01", "done"),
        "e/t2.md": TASK("E01-F01-T02", "pending"),
      },
      (graph) => {
        expect(computeFeatureDone(graph, "E01-F01").done).toBe(false);
      },
    );
  });

  it("feature'ın hiç task'ı yoksa done:false (boş/henüz genişletilmemiş feature 'bitti' sayılmaz)", () => {
    withTempGraph(
      { "e/epic.md": EPIC("E01"), "e/f1.md": FEATURE("E01-F01") },
      (graph) => {
        expect(computeFeatureDone(graph, "E01-F01").done).toBe(false);
      },
    );
  });

  it("feature'ın KENDİ status'u 'done' yazılsa bile (gerçek bir graph'ta bu asla olmaz) bu YETERLİ SAYILMAZ — altındaki task'lara bakılır", () => {
    withTempGraph(
      {
        "e/epic.md": EPIC("E01"),
        "e/f1.md": FEATURE("E01-F01", "done"),
        "e/t1.md": TASK("E01-F01-T01", "pending"),
      },
      (graph) => {
        expect(computeFeatureDone(graph, "E01-F01").done).toBe(false);
      },
    );
  });
});
