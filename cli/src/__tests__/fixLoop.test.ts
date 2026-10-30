import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  computeFixLoopStatus,
  computeFixLoopTokenRatio,
  markFixLoopReset,
  readCurrentAttemptRounds,
  readFixLoopRounds,
  recordFixLoopRound,
} from "../fixLoop.js";

describe("recordFixLoopRound + readFixLoopRounds", () => {
  it("kaydedilen turları node bazında doğru filtreler", () => {
    const dir = mkdtempSync(join(tmpdir(), "gp-fixloop-test-"));
    try {
      recordFixLoopRound(dir, "E01-F01-T01", { round: 1, issuesCount: 3, tokens: 500 });
      recordFixLoopRound(dir, "E01-F01-T01", { round: 2, issuesCount: 1, tokens: 400 });
      recordFixLoopRound(dir, "E01-F01-T02", { round: 1, issuesCount: 5 }); // başka düğüm
      const rounds = readFixLoopRounds(dir, "E01-F01-T01");
      expect(rounds).toEqual([
        { round: 1, issuesCount: 3, tokens: 500 },
        { round: 2, issuesCount: 1, tokens: 400 },
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("hiç tur yoksa boş dizi döner", () => {
    const dir = mkdtempSync(join(tmpdir(), "gp-fixloop-test-"));
    try {
      expect(readFixLoopRounds(dir, "yok")).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("markFixLoopReset + readCurrentAttemptRounds — Faz 15", () => {
  it("escalate işaretinden sonraki turları verir; ölçüm tüm turları görmeye devam eder", () => {
    const dir = mkdtempSync(join(tmpdir(), "gp-fixloop-test-"));
    try {
      recordFixLoopRound(dir, "T", { round: 1, issuesCount: 2 });
      recordFixLoopRound(dir, "T", { round: 2, issuesCount: 2 });
      markFixLoopReset(dir, "T");
      expect(readCurrentAttemptRounds(dir, "T")).toEqual([]);
      recordFixLoopRound(dir, "T", { round: 3, issuesCount: 1 });
      expect(readCurrentAttemptRounds(dir, "T")).toEqual([{ round: 3, issuesCount: 1, tokens: undefined }]);
      expect(readFixLoopRounds(dir, "T").map((r) => r.round)).toEqual([1, 2, 3]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("computeFixLoopStatus — Frenler (SPEC/roadmap 6.3)", () => {
  const OPTS = { maxRounds: 3, breakIfNoProgress: true };

  it("hiç tur yoksa devam eder", () => {
    expect(computeFixLoopStatus([], OPTS).shouldBreak).toBe(false);
  });

  it("son turda 0 eksik varsa yakınsadı, kırılır", () => {
    const status = computeFixLoopStatus(
      [
        { round: 1, issuesCount: 3 },
        { round: 2, issuesCount: 0 },
      ],
      OPTS,
    );
    expect(status.shouldBreak).toBe(true);
    expect(status.converged).toBe(true);
  });

  it("max_rounds'a ulaşılırsa kırılır (yakınsamamış)", () => {
    const status = computeFixLoopStatus(
      [
        { round: 1, issuesCount: 5 },
        { round: 2, issuesCount: 4 },
        { round: 3, issuesCount: 3 },
      ],
      OPTS,
    );
    expect(status.shouldBreak).toBe(true);
    expect(status.converged).toBe(false);
    expect(status.reason).toContain("tur sınırına");
  });

  it("eksik sayısı azalmıyorsa (ilerleme yok) kırılır, max_rounds'a varmadan", () => {
    const status = computeFixLoopStatus(
      [
        { round: 1, issuesCount: 3 },
        { round: 2, issuesCount: 3 },
      ],
      OPTS,
    );
    expect(status.shouldBreak).toBe(true);
    expect(status.reason).toContain("ilerleme yok");
  });

  it("eksik sayısı AZALIYORSA ve max_rounds'a ulaşılmadıysa devam eder", () => {
    const status = computeFixLoopStatus(
      [
        { round: 1, issuesCount: 5 },
        { round: 2, issuesCount: 3 },
      ],
      OPTS,
    );
    expect(status.shouldBreak).toBe(false);
  });

  it("breakIfNoProgress: false ise ilerlemesiz turlarda da devam eder (max_rounds'a kadar)", () => {
    const status = computeFixLoopStatus(
      [
        { round: 1, issuesCount: 3 },
        { round: 2, issuesCount: 3 },
      ],
      { maxRounds: 5, breakIfNoProgress: false },
    );
    expect(status.shouldBreak).toBe(false);
  });

  it("token toplamı bütçenin 2 katını aşarsa kırılır", () => {
    const status = computeFixLoopStatus(
      [
        { round: 1, issuesCount: 5, tokens: 9000 },
        { round: 2, issuesCount: 4, tokens: 8000 },
      ],
      { ...OPTS, nodeBudget: 8000 },
    );
    expect(status.shouldBreak).toBe(true);
    expect(status.reason).toContain("token bütçesinin");
  });

  it("nodeBudget verilmezse token kontrolü atlanır", () => {
    const status = computeFixLoopStatus([{ round: 1, issuesCount: 5, tokens: 999999 }], OPTS);
    expect(status.shouldBreak).toBe(false);
  });
});

describe("computeFixLoopTokenRatio — Faz 7.8", () => {
  it("sonraki turlar ilk turdan çok daha az token kullanıyorsa oran küçük", () => {
    const ratio = computeFixLoopTokenRatio([
      { round: 1, issuesCount: 3, tokens: 1000 },
      { round: 2, issuesCount: 1, tokens: 100 },
      { round: 3, issuesCount: 0, tokens: 80 },
    ]);
    expect(ratio.firstRoundTokens).toBe(1000);
    expect(ratio.laterRoundsTokens).toBe(180);
    expect(ratio.ratio).toBeCloseTo(0.18);
  });

  it("tek tur varsa laterRoundsTokens 0, ratio 0", () => {
    const ratio = computeFixLoopTokenRatio([{ round: 1, issuesCount: 0, tokens: 500 }]);
    expect(ratio.ratio).toBe(0);
  });

  it("ilk turda token bilgisi yoksa ratio null (0'a bölme değil)", () => {
    const ratio = computeFixLoopTokenRatio([
      { round: 1, issuesCount: 1 },
      { round: 2, issuesCount: 0, tokens: 50 },
    ]);
    expect(ratio.ratio).toBeNull();
  });

  it("hiç tur yoksa hepsi 0/null", () => {
    expect(computeFixLoopTokenRatio([])).toEqual({
      firstRoundTokens: 0,
      laterRoundsTokens: 0,
      ratio: null,
    });
  });
});
