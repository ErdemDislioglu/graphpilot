import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseGraph } from "../graph/parser.js";
import { computeStatusSummary } from "../status.js";

const here = dirname(fileURLToPath(import.meta.url));
const bookstoreGraph = join(here, "../../../docs/examples/bookstore/.graph");

describe("computeStatusSummary — gerçek bookstore graph", () => {
  const summary = computeStatusSummary(parseGraph(bookstoreGraph));

  it("toplam 11 düğüm", () => expect(summary.total).toBe(11));

  it("byKind: 1 epic, 2 feature, 5 task, 3 knowledge", () => {
    expect(summary.byKind).toEqual({ epic: 1, feature: 2, task: 5, knowledge: 3 });
  });

  it("byStatus: task/feature/epic'lerin durumları sayılır, knowledge hariç (status alanı yok)", () => {
    // 1 running (epic) + 1 running (feature F01) + 1 done (T01) + 1 pending (F02) + 4 pending (task'lar)
    expect(summary.byStatus.running).toBe(2);
    expect(summary.byStatus.done).toBe(1);
    expect(summary.byStatus.pending).toBe(5);
  });

  it("running düğümler listelenir", () => {
    expect(summary.running.map((n) => n.id).sort()).toEqual(["E01", "E01-F01"]);
  });
});
