/**
 * Roadmap 12.1/12.7 — "Limit hatasını tanı, sıfırlanma zamanını oku". Faz 9.2'nin
 * `isRateLimitSignal`'ı (ikili: limit mi/değil mi) otopilot için yeterli değil — bir
 * kısa süreli rate limit (saniyeler) ile bir haftalık abonelik limiti (saatler) AYNI
 * bekleme stratejisiyle ele alınamaz. Bu yüzden üç kategoriye ayrılır.
 *
 * Metinler `docs.claude.com/en/errors`'tan (2026-10-24, gerçekten WebFetch ile okundu)
 * — GERÇEK, doğrulanmış hata mesajları, tahmin değil. ❗ DOĞRULANMADI kalan: bu metnin
 * `claude -p --output-format json` çıktısının TAM OLARAK hangi alanında (stdout/stderr,
 * hangi JSON key) göründüğü — doküman bunu belirtmiyor (Açık Soru #5, kısmen kapandı).
 * Sıfırlanma zamanı metinde varsa (ör. "3:14am'e kadar") okunmaya çalışılır; yoksa
 * `null` döner — çağıran taraf artan aralıklarla yeniden denemeli (roadmap 12.7).
 */
export type LimitKind = "usage_limit" | "rate_limit" | "spend_limit" | null;
export interface LimitClassification {
    kind: LimitKind;
    matchedText?: string;
    /** Metinde bulunabilirse sıfırlanma zamanı/süresi hakkında ham ipucu (ör. "3:14am"). */
    resetHint?: string;
}
export declare function classifyLimitError(text: string): LimitClassification;
