import { describe, expect, it } from "vitest";
import { estimateReportTokens, exceedsReportBudget, parseTeamReport } from "../team/report.js";

const VALID = {
  node: "E02-F01-T03",
  status: "done",
  summary: "Kitap arama endpoint'i yazıldı, testler geçti",
  findings: [],
  tokens: 6200,
};

describe("parseTeamReport — roadmap 13.6", () => {
  it("geçerli raporu kabul eder", () => {
    expect(parseTeamReport(VALID)).toEqual(VALID);
  });

  it("findings hiç verilmezse boş dizi varsayılan", () => {
    const withoutFindings = { node: VALID.node, status: VALID.status, summary: VALID.summary, tokens: VALID.tokens };
    expect(parseTeamReport(withoutFindings).findings).toEqual([]);
  });

  it("geçersiz status reddedilir", () => {
    expect(() => parseTeamReport({ ...VALID, status: "in_progress" })).toThrow();
  });

  it("beklenmeyen alan (ör. diff) reddedilir (.strict(), roadmap 13.12)", () => {
    expect(() => parseTeamReport({ ...VALID, diff: "--- a.ts\n+++ b.ts" })).toThrow();
  });

  it("içindeki findings da doğrulanır (geçersiz finding raporu düşürür)", () => {
    const bad = { ...VALID, findings: [{ kind: "security" }] };
    expect(() => parseTeamReport(bad)).toThrow();
  });

  it("anlamsız girdi anlamlı hata fırlatır, çökmez", () => {
    expect(() => parseTeamReport(42)).toThrow(/geçersiz ekip raporu/);
  });
});

describe("estimateReportTokens / exceedsReportBudget — roadmap 13.6 (~200 token bütçesi)", () => {
  it("kısa bir raporun tahmini 200 token'ın altında kalır", () => {
    const report = parseTeamReport(VALID);
    expect(exceedsReportBudget(report)).toBe(false);
  });

  it("çok uzun bir summary (800 karakter sınırına yakın) bütçeyi aşırır", () => {
    const report = parseTeamReport({ ...VALID, summary: "x ".repeat(395) }); // 790 karakter
    expect(estimateReportTokens(report)).toBeGreaterThan(200);
    expect(exceedsReportBudget(report)).toBe(true);
  });
});
