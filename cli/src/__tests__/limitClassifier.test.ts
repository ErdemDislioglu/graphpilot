import { describe, expect, it } from "vitest";
import { classifyLimitError } from "../autopilot/limitClassifier.js";

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
