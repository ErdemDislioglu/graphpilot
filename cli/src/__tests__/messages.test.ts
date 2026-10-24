import { describe, expect, it } from "vitest";
import {
  decisionNeededMessage,
  epicDoneMessage,
  failureApprovalMessage,
  finishedMessage,
  formatImpactText,
  formatTokenCount,
  limitMessage,
  resumeMessage,
} from "../autopilot/messages.js";

describe("formatTokenCount", () => {
  it("binin üstünü K'ya yuvarlar", () => {
    expect(formatTokenCount(142000)).toBe("142K");
  });
  it("binin altını olduğu gibi döner", () => {
    expect(formatTokenCount(500)).toBe("500");
  });
});

describe("epicDoneMessage — roadmap 12.5 örneğiyle birebir", () => {
  it("TR: '✅ E03 Katalog tamamlandı · 8 görev · 142K token · sıradaki: E04 Sepet'", () => {
    const m = epicDoneMessage("tr", {
      epicId: "E03",
      epicTitle: "Katalog",
      taskCount: 8,
      tokens: 142000,
      nextEpicId: "E04",
      nextEpicTitle: "Sepet",
    });
    expect(m.text).toBe("✅ E03 Katalog tamamlandı · 8 görev · 142K token · sıradaki: E04 Sepet");
  });

  it("sıradaki epic yoksa (son epic) 'sıradaki' kısmı eklenmez", () => {
    const m = epicDoneMessage("tr", { epicId: "E05", epicTitle: "Son", taskCount: 3, tokens: 1000 });
    expect(m.text).toBe("✅ E05 Son tamamlandı · 3 görev · 1K token");
  });

  it("EN dilinde çevrilmiş metin üretir", () => {
    const m = epicDoneMessage("en", { epicId: "E03", epicTitle: "Catalog", taskCount: 8, tokens: 142000 });
    expect(m.text).toBe("✅ E03 Catalog done · 8 tasks · 142K tokens");
  });
});

describe("failureApprovalMessage — roadmap 12.5 örneğiyle birebir", () => {
  it("TR metin ve 4 buton üretir", () => {
    const m = failureApprovalMessage("tr", {
      nodeId: "E04-F01-T03",
      nodeTitle: "Sepete ekleme",
      attempts: 3,
      lastError: "miktar testi",
    });
    expect(m.text).toBe('⚠️ E04-F01-T03 "Sepete ekleme" 3 denemede geçemedi (son hata: miktar testi).');
    expect(m.buttons?.map((b) => b.value)).toEqual(["retry", "escalate", "skip", "stop"]);
  });
});

describe("limitMessage", () => {
  it("resetHint varsa saat bilgisini içerir", () => {
    const m = limitMessage("tr", { resetHint: "14:20", doneCount: 18, totalCount: 26 });
    expect(m.text).toBe("⏸ Kullanım limiti doldu. ~14:20'de otomatik devam edecek. 18/26 görev tamam.");
  });

  it("resetHint yoksa genel bir mesaj üretir (saat tahmin etmez)", () => {
    const m = limitMessage("tr", { doneCount: 1, totalCount: 2 });
    expect(m.text).toBe("⏸ Kullanım limiti doldu. sıfırlanınca otomatik devam edecek. 1/2 görev tamam.");
  });
});

describe("resumeMessage", () => {
  it("TR: '▶️ Devam ediliyor: ... kaldığı yerden.'", () => {
    expect(resumeMessage("tr", { nodeId: "E04-F01-T03" }).text).toBe(
      "▶️ Devam ediliyor: E04-F01-T03 kaldığı yerden.",
    );
  });
});

describe("finishedMessage — roadmap 12.5 örneğiyle birebir", () => {
  it("TR: '🏁 Proje tamamlandı · 26 görev · ~186K token · 2 yükseltme · rapor: ...'", () => {
    const m = finishedMessage("tr", {
      taskCount: 26,
      tokens: 186000,
      escalations: 2,
      reportPath: ".graph/_metrics/report.md",
    });
    expect(m.text).toBe(
      "🏁 Proje tamamlandı · 26 görev · ~186K token · 2 yükseltme · rapor: .graph/_metrics/report.md",
    );
  });
});

describe("decisionNeededMessage / formatImpactText — roadmap 13.9", () => {
  it("TR: roadmap örneğiyle birebir (durum/etki/öneri + butonlar)", () => {
    const m = decisionNeededMessage("tr", {
      nodeId: "E02-F01-T03",
      nodeTitle: "Şifre sıfırlama",
      situation: "Sıfırlama token'ı süresiz oluşturuluyor; ele geçirilirse kalıcı erişim sağlar.",
      impactText: "Bu karar E02-F01-T04 ve T05'i bekletiyor. Diğer 4 görev devam ediyor.",
      recommendedOption: "15 dk süre sınırı ekle",
      options: ["15 dk sınır", "Olduğu gibi bırak", "Ayrı görev aç"],
      recommendedIndex: 0,
    });
    expect(m.text).toBe(
      [
        '❓ Karar gerekiyor · E02-F01-T03 "Şifre sıfırlama"',
        "Durum: Sıfırlama token'ı süresiz oluşturuluyor; ele geçirilirse kalıcı erişim sağlar.",
        "Etki: Bu karar E02-F01-T04 ve T05'i bekletiyor. Diğer 4 görev devam ediyor.",
        "Yöneticinin önerisi: 15 dk süre sınırı ekle",
      ].join("\n"),
    );
    expect(m.buttons).toEqual([
      { label: "15 dk sınır (önerilen)", value: "0" },
      { label: "Olduğu gibi bırak", value: "1" },
      { label: "Ayrı görev aç", value: "2" },
      { label: "Durdur", value: "stop" },
    ]);
  });

  it("formatImpactText — bağımlı görev varsa onları adıyla listeler", () => {
    expect(
      formatImpactText("tr", { blockedTaskIds: ["E02-F01-T04", "E02-F01-T05"], independentCount: 4 }),
    ).toBe("Bu karar E02-F01-T04, E02-F01-T05'i bekletiyor. Diğer 4 görev devam ediyor.");
  });

  it("formatImpactText — bağımlı görev yoksa bunu açıkça söyler (tahmin etmez)", () => {
    expect(formatImpactText("tr", { blockedTaskIds: [], independentCount: 7 })).toBe(
      "Bekleyen bağımlı görev yok. Diğer 7 görev devam ediyor.",
    );
  });
});
