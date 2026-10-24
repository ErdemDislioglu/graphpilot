import { describe, expect, it } from "vitest";
import { parseFinding } from "../team/finding.js";

const VALID = {
  kind: "security",
  severity: "blocking",
  summary: "Şifre sıfırlama token'ı süresiz",
  options: ["15 dk süre sınırı ekle", "Olduğu gibi bırak", "Ayrı görev aç"],
  recommended: 0,
};

describe("parseFinding — roadmap 13.7", () => {
  it("geçerli bulguyu kabul eder", () => {
    expect(parseFinding(VALID)).toEqual(VALID);
  });

  it("recommended, options sınırları dışındaysa reddeder", () => {
    expect(() => parseFinding({ ...VALID, recommended: 5 })).toThrow();
  });

  it("bilinmeyen kind reddedilir", () => {
    expect(() => parseFinding({ ...VALID, kind: "performance" })).toThrow();
  });

  it("beklenmeyen ek alan (ör. kod) reddedilir (.strict())", () => {
    expect(() => parseFinding({ ...VALID, code: "console.log(1)" })).toThrow();
  });

  it("boş options dizisi reddedilir", () => {
    expect(() => parseFinding({ ...VALID, options: [] })).toThrow();
  });

  it("anlamsız girdi (string) anlamlı hata fırlatır, çökmez", () => {
    expect(() => parseFinding("merhaba")).toThrow(/geçersiz bulgu/);
  });
});
