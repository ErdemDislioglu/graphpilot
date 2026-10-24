import { describe, expect, it } from "vitest";
import { parseTranscriptUsage, summarizeTranscript } from "../metricsIngest.js";

// Satır şekilleri ADR-012/docs/SPEC.md §13'te belgelenen GERÇEK oturum kayıtlarından
// (bu projenin kendi transcript'leri) birebir alındı — uydurma alan adı yok.
const SYNTHETIC_LINE = JSON.stringify({
  type: "assistant",
  timestamp: "2026-10-24T10:00:00.000Z",
  message: {
    model: "<synthetic>",
    usage: { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
  },
});

const REAL_OPUS_LINE = JSON.stringify({
  type: "assistant",
  timestamp: "2026-10-23T19:32:55.648Z",
  message: {
    model: "claude-opus-5",
    usage: {
      input_tokens: 2,
      output_tokens: 141,
      cache_creation_input_tokens: 4195,
      cache_read_input_tokens: 39020,
      output_tokens_details: { thinking_tokens: 11 },
    },
  },
});

const REAL_SONNET_LINE = JSON.stringify({
  type: "assistant",
  timestamp: "2026-10-24T09:00:00.000Z",
  message: {
    model: "claude-sonnet-5",
    usage: { input_tokens: 10, output_tokens: 50, cache_creation_input_tokens: 0, cache_read_input_tokens: 1000 },
  },
});

const USER_TOOL_RESULT_LINE = JSON.stringify({
  type: "user",
  message: { role: "user", content: [{ type: "tool_result", content: "ok" }] },
  toolUseResult: { stdout: "ok", stderr: "", interrupted: false, isImage: false, noOutputExpected: false },
});

describe("parseTranscriptUsage", () => {
  it("<synthetic> model satırlarını atlar (gerçek API kullanımı değil)", () => {
    const turns = parseTranscriptUsage(SYNTHETIC_LINE);
    expect(turns).toEqual([]);
  });

  it("type:user (toolUseResult) satırlarını atlar", () => {
    expect(parseTranscriptUsage(USER_TOOL_RESULT_LINE)).toEqual([]);
  });

  it("gerçek bir model satırından doğru alanları çıkarır", () => {
    const turns = parseTranscriptUsage(REAL_OPUS_LINE);
    expect(turns).toEqual([
      {
        timestamp: "2026-10-23T19:32:55.648Z",
        model: "claude-opus-5",
        inputTokens: 2,
        outputTokens: 141,
        cacheCreationInputTokens: 4195,
        cacheReadInputTokens: 39020,
      },
    ]);
  });

  it("bozuk/boş satırları atlar, tüm dosyayı düşürmez", () => {
    const content = [REAL_OPUS_LINE, "bozuk json {{{", "", "   "].join("\n");
    expect(parseTranscriptUsage(content)).toHaveLength(1);
  });

  it("usage'da bilinmeyen/eksik alt alan varsa 0 varsayar, fırlatmaz", () => {
    const minimal = JSON.stringify({
      type: "assistant",
      message: { model: "claude-haiku-4-5", usage: { input_tokens: 5 } },
    });
    const turns = parseTranscriptUsage(minimal);
    expect(turns[0].outputTokens).toBe(0);
    expect(turns[0].cacheReadInputTokens).toBe(0);
  });

  it("çok satırlı gerçekçi bir transcript'i doğru ayrıştırır (karışık tipler)", () => {
    const content = [SYNTHETIC_LINE, REAL_OPUS_LINE, USER_TOOL_RESULT_LINE, REAL_SONNET_LINE].join("\n");
    const turns = parseTranscriptUsage(content);
    expect(turns.map((t) => t.model)).toEqual(["claude-opus-5", "claude-sonnet-5"]);
  });
});

describe("summarizeTranscript", () => {
  it("model başına ve toplamda doğru toplar", () => {
    const turns = parseTranscriptUsage([REAL_OPUS_LINE, REAL_SONNET_LINE].join("\n"));
    const summary = summarizeTranscript(turns);
    expect(summary.turns).toBe(2);
    expect(summary.byModel["claude-opus-5"].inputTokens).toBe(2);
    expect(summary.byModel["claude-sonnet-5"].inputTokens).toBe(10);
    expect(summary.totalOutputTokens).toBe(191);
  });

  it("cache okuma oranını hesaplar (Faz 7.1'in bloke kalan ölçümü)", () => {
    const turns = parseTranscriptUsage(REAL_OPUS_LINE);
    const summary = summarizeTranscript(turns);
    // 39020 / (2 + 4195 + 39020)
    expect(summary.cacheReadRatio).toBeCloseTo(39020 / (2 + 4195 + 39020));
  });

  it("hiç tur yoksa cacheReadRatio null (0'a bölme değil)", () => {
    expect(summarizeTranscript([]).cacheReadRatio).toBeNull();
  });
});
