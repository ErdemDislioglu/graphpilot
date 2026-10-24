import { describe, expect, it } from "vitest";
import { topoSort } from "../toposort.js";

describe("topoSort", () => {
  it("basit zincir: A <- B <- C (C, B'ye; B, A'ya bağımlı)", () => {
    // depends_on kenarları [from, to] = [bağımlı, bağımlı-olunan]
    const result = topoSort(
      ["A", "B", "C"],
      [
        ["B", "A"],
        ["C", "B"],
      ],
    );
    expect(result.cycleNodes).toEqual([]);
    expect(result.order).toEqual(["A", "B", "C"]);
  });

  it("bağımsız düğümler alfabetik sırada gelir (deterministik)", () => {
    const result = topoSort(["C", "A", "B"], []);
    expect(result.order).toEqual(["A", "B", "C"]);
  });

  it("döngüyü tespit eder: A->B->A", () => {
    const result = topoSort(
      ["A", "B"],
      [
        ["A", "B"],
        ["B", "A"],
      ],
    );
    expect(result.cycleNodes).toEqual(["A", "B"]);
    expect(result.order).toEqual([]);
  });

  it("kısmi döngü: döngü dışındaki düğümler sıralanır, döngü ayrı raporlanır", () => {
    const result = topoSort(
      ["A", "B", "C", "D"],
      [
        ["C", "D"], // C, D'ye bağımlı — döngü dışı
        ["A", "B"],
        ["B", "A"], // A<->B döngüsü
      ],
    );
    expect(result.order).toEqual(["D", "C"]);
    expect(result.cycleNodes).toEqual(["A", "B"]);
  });

  it("graph dışı referans sessizce yoksayılır (validate.ts kırık linki raporlar)", () => {
    const result = topoSort(["A"], [["A", "YOK"]]);
    expect(result.order).toEqual(["A"]);
    expect(result.cycleNodes).toEqual([]);
  });
});
