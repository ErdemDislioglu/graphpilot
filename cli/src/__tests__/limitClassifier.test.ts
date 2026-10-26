import { describe, expect, it } from "vitest";
import { classifyLimitError } from "../autopilot/limitClassifier.js";
import { isRateLimitSignal } from "../runModeB.js";

describe("classifyLimitError", () => {
  it.each([
    "You've hit your session limit",
    "You've hit your weekly limit",
    "You've hit your Opus limit",
    "You've hit your Sonnet limit",
  ])("'%s' → usage_limit", (text) => {
    expect(classifyLimitError(text).kind).toBe("usage_limit");
  });

  it.each([
    "You've hit your monthly spend limit",
    "You've hit your individual spend limit",
    "You've hit your team's shared budget",
    "Credit balance is too low",
  ])("'%s' → spend_limit", (text) => {
    expect(classifyLimitError(text).kind).toBe("spend_limit");
  });

  it.each(["Server is temporarily limiting requests", "429 Too Many Requests", "rate limit exceeded"])(
    "'%s' → rate_limit",
    (text) => {
      expect(classifyLimitError(text).kind).toBe("rate_limit");
    },
  );

  it("normal bir hata hiçbir kategoriye girmez", () => {
    expect(classifyLimitError("SyntaxError: unexpected token").kind).toBeNull();
  });

  it("sıfırlanma zamanı metinde varsa resetHint'e çıkarır", () => {
    const result = classifyLimitError("You've hit your session limit. Resets at 3:14am.");
    expect(result.resetHint).toBe("3:14am");
  });

  it("sıfırlanma zamanı yoksa resetHint undefined (tahmin etmez)", () => {
    const result = classifyLimitError("You've hit your weekly limit.");
    expect(result.resetHint).toBeUndefined();
  });

  it("hem spend hem usage deseni varsa spend_limit öncelikli (bekleyerek çözülmez)", () => {
    const result = classifyLimitError("You've hit your monthly spend limit and your session limit");
    expect(result.kind).toBe("spend_limit");
  });
});

describe("HTTP 429 — bağlamsız sayı limit sayılmaz (Faz 12.13 pilot bulgusu)", () => {
  it("claude -p JSON çıktısındaki 429 içeren sayılar limit sinyali DEĞİL", () => {
    const stdout = '{"type":"result","subtype":"error_max_turns","duration_ms":14291,"usage":{"input_tokens":4290}}';
    expect(classifyLimitError(stdout)).toEqual({ kind: null });
    expect(isRateLimitSignal(stdout)).toBe(false);
  });

  it.each(["429 Too Many Requests", "API Error: status 429", "HTTP 429", "error: 429"])(
    "bağlamıyla gelen 429 rate_limit sayılır: %s",
    (text) => {
      expect(classifyLimitError(text).kind).toBe("rate_limit");
      expect(isRateLimitSignal(text)).toBe(true);
    },
  );
});
