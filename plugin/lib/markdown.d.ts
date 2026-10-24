/**
 * Paylaşılan markdown bölüm yardımcıları. `validate.ts` (Handoff/brief token sınırı),
 * `context.ts` (bağımlılıkların sadece Handoff'u), `resumeSummary.ts` (Yarım iş/Hata
 * geçmişi) ve `escalate.ts`/`fail.ts` (Faz 6 — Hata geçmişine satır ekleme) kullanır.
 */
/**
 * `## <heading>` başlığından, aynı veya daha üst seviyede bir sonraki `#` başlığına
 * (veya dosya sonuna) kadar olan gövdeyi döndürür. Başlık yoksa `null`.
 */
export declare function extractSection(body: string, heading: string): string | null;
/**
 * SPEC/roadmap 6.5, 6.7 — `## Hata geçmişi` / `## Yarım iş` gibi bölümlere tek satır
 * ekler. Başlık yoksa gövdenin sonuna oluşturur. Bölüm sadece bir placeholder
 * (`*(...)*`) içeriyorsa onun üzerine yazar, gerçek içerik varsa SONUNA ekler.
 */
export declare function appendToSection(body: string, heading: string, line: string): string;
