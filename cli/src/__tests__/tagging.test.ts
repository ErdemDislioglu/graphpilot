import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { computeMisTagRatio, readMisTagRecords, recordMisTag, summarizeMisTags } from "../team/tagging.js";

let dir: string;

afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

describe("tagging.ts — roadmap 13.4", () => {
  it("recordMisTag sonrası readMisTagRecords gerçekten yazılanı döner", () => {
    dir = mkdtempSync(join(tmpdir(), "gp-tagging-test-"));
    recordMisTag(dir, { nodeId: "E01-F01-T01", direction: "underestimated", reason: "junior başarısız" });
    const records = readMisTagRecords(dir);
    expect(records).toHaveLength(1);
    expect(records[0].nodeId).toBe("E01-F01-T01");
    expect(records[0].direction).toBe("underestimated");
    expect(records[0].ts).toBeTruthy();
  });

  it("hiç kayıt yoksa summarizeMisTags sıfırlarla döner, çökmez", () => {
    dir = mkdtempSync(join(tmpdir(), "gp-tagging-test-"));
    expect(summarizeMisTags(dir)).toEqual({ total: 0, underestimated: 0, overestimated: 0 });
  });

  it("summarizeMisTags underestimated/overestimated'ı ayrı sayar", () => {
    dir = mkdtempSync(join(tmpdir(), "gp-tagging-test-"));
    recordMisTag(dir, { nodeId: "T01", direction: "underestimated", reason: "x" });
    recordMisTag(dir, { nodeId: "T02", direction: "underestimated", reason: "x" });
    recordMisTag(dir, { nodeId: "T03", direction: "overestimated", reason: "x" });
    expect(summarizeMisTags(dir)).toEqual({ total: 3, underestimated: 2, overestimated: 1 });
  });

  it("computeMisTagRatio toplam bitmiş görev sayısına böler", () => {
    dir = mkdtempSync(join(tmpdir(), "gp-tagging-test-"));
    recordMisTag(dir, { nodeId: "T01", direction: "underestimated", reason: "x" });
    expect(computeMisTagRatio(dir, 4)).toBe(0.25);
  });

  it("totalDoneTasks 0 ise 0 döner (bölme hatası yok)", () => {
    dir = mkdtempSync(join(tmpdir(), "gp-tagging-test-"));
    expect(computeMisTagRatio(dir, 0)).toBe(0);
  });
});
