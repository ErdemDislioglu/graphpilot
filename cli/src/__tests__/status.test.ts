import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseGraph } from "../graph/parser.js";
import { computeStatusSummary } from "../status.js";

const here = dirname(fileURLToPath(import.meta.url));
const bookstoreGraph = join(here, "../../../docs/examples/bookstore/.graph");

describe("computeStatusSummary — gerçek bookstore graph", () => {
  const summary = computeStatusSummary(parseGraph(bookstoreGraph));

  it("toplam 12 düğüm", () => expect(summary.total).toBe(12));

  it("byKind: 1 epic, 2 feature, 6 task, 3 knowledge", () => {
    expect(summary.byKind).toEqual({ epic: 1, feature: 2, task: 6, knowledge: 3 });
  });

  it("byStatus: task/feature/epic'lerin durumları sayılır, knowledge hariç (status alanı yok)", () => {
    // 1 running (epic) + 1 running (feature F01) + 1 done (T01) + 1 pending (F02) + 5 pending (task'lar)
    expect(summary.byStatus.running).toBe(2);
    expect(summary.byStatus.done).toBe(1);
    expect(summary.byStatus.pending).toBe(6);
  });

  it("running düğümler listelenir", () => {
    expect(summary.running.map((n) => n.id).sort()).toEqual(["E01", "E01-F01"]);
  });
});
