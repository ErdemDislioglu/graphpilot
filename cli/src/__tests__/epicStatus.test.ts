import { describe, expect, it } from "vitest";
import { computeEpicDone } from "../epicStatus.js";
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
});
