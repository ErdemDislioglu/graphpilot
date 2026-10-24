import { describe, expect, it } from "vitest";
import { appendToSection, extractSection } from "../markdown.js";

describe("extractSection", () => {
  it("var olan bölümü döndürür, bir sonraki ## başlığında durur", () => {
    const body = "## Görev\nx\n\n## Handoff\nHandoff içeriği\n\n## Notlar\ny\n";
    expect(extractSection(body, "Handoff")).toBe("Handoff içeriği");
  });

  it("dosya sonuna kadar olan bölümü döndürür", () => {
    const body = "## Görev\nx\n\n## Handoff\nson bölüm\niki satır\n";
    expect(extractSection(body, "Handoff")).toBe("son bölüm\niki satır");
  });

  it("başlık yoksa null döner", () => {
    expect(extractSection("## Görev\nx\n", "Handoff")).toBeNull();
  });
});

describe("appendToSection", () => {
  it("başlık hiç yoksa gövdenin sonuna oluşturur", () => {
    const body = "## Görev\nx\n";
    const result = appendToSection(body, "Hata geçmişi", "deneme 1: tip hatası");
    expect(result).toContain("## Hata geçmişi");
    expect(extractSection(result, "Hata geçmişi")).toBe("- deneme 1: tip hatası");
  });

  it("placeholder içeren bölümün üzerine yazar (eski placeholder kaybolur)", () => {
    const body = "## Handoff\n\n*(Henüz çalıştırılmadı.)*\n";
    const result = appendToSection(body, "Handoff", "ilk not");
    expect(extractSection(result, "Handoff")).toBe("- ilk not");
    expect(result).not.toContain("Henüz çalıştırılmadı");
  });

  it("gerçek içerik varsa SONUNA ekler, öncekini silmez", () => {
    const body = "## Hata geçmişi\n- deneme 1: tip hatası\n";
    const result = appendToSection(body, "Hata geçmişi", "deneme 2: test timeout");
    expect(extractSection(result, "Hata geçmişi")).toBe(
      "- deneme 1: tip hatası\n- deneme 2: test timeout",
    );
  });

  it("bölümden SONRAKİ diğer bölümlere dokunmaz", () => {
    const body = "## Görev\nx\n\n## Hata geçmişi\n- deneme 1\n\n## Notlar\nbu değişmemeli\n";
    const result = appendToSection(body, "Hata geçmişi", "deneme 2");
    expect(extractSection(result, "Notlar")).toBe("bu değişmemeli");
    expect(extractSection(result, "Görev")).toBe("x");
  });

  it("iki kez üst üste çağrıldığında ikisi de korunur (gerçek kullanım: her escalation bir satır)", () => {
    let body = "## Hata geçmişi\n\n*(yok)*\n";
    body = appendToSection(body, "Hata geçmişi", "deneme 1: haiku başarısız");
    body = appendToSection(body, "Hata geçmişi", "deneme 2: sonnet'e yükseltildi");
    expect(extractSection(body, "Hata geçmişi")).toBe(
      "- deneme 1: haiku başarısız\n- deneme 2: sonnet'e yükseltildi",
    );
  });
});
