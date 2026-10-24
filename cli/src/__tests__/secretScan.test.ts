import { describe, expect, it } from "vitest";
import { scanForSecretLikeContent } from "../secretScan.js";

describe("scanForSecretLikeContent", () => {
  it("PEM özel anahtarını bulur", () => {
    const result = scanForSecretLikeContent("-----BEGIN RSA PRIVATE KEY-----\nMIIB...\n");
    expect(result.found).toBe(true);
    expect(result.matches[0].label).toContain("PEM");
  });

  it("AWS access key id'yi bulur", () => {
    const result = scanForSecretLikeContent("key = AKIAABCDEFGHIJKLMNOP burada");
    expect(result.found).toBe(true);
  });

  it("yüksek-entropili bir ortam değişkeni atamasını bulur", () => {
    const result = scanForSecretLikeContent("STRIPE_SECRET=sk_live_abcdef1234567890ghij");
    expect(result.found).toBe(true);
  });

  it("gerçek sırrı eşleşme sonucuna TAM olarak koymaz (kırpılmış)", () => {
    const result = scanForSecretLikeContent("API_TOKEN=supersecretvalue1234567890");
    expect(result.matches[0].redactedSnippet).not.toContain("supersecretvalue1234567890");
    expect(result.matches[0].redactedSnippet.length).toBeLessThan(15);
  });

  it("sadece 'api key' kelimesi geçmesi (değer yok) yanlış pozitif ÜRETMEZ", () => {
    const result = scanForSecretLikeContent(
      "Bu fonksiyon bir api_key parametresi alır ve onu doğrular.",
    );
    expect(result.found).toBe(false);
  });

  it("normal teknik dokümantasyon (handoff/arayüz metni) temiz çıkar", () => {
    const result = scanForSecretLikeContent(
      "## Arayüz\n\n`createServer({ store, routes })` — http.Server döner.\n",
    );
    expect(result.found).toBe(false);
  });

  it("boş metin temiz çıkar", () => {
    expect(scanForSecretLikeContent("").found).toBe(false);
  });
});
