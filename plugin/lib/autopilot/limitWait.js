const MIN_INTERVAL_MS = 60_000; // 1 dk
const MAX_INTERVAL_MS = 30 * 60_000; // 30 dk tavan
/**
 * "3:14am" / "14:20" → BUGÜN (ya da saat zaten geçtiyse YARIN) o saate denk gelen mutlak
 * epoch ms. Biçim belirsiz/anlaşılmazsa `null` (tahmin etmez — çağıran artan aralığa düşer).
 */
export function resetHintToEpochMs(resetHint, nowMs) {
    const m = resetHint.match(/^(\d{1,2}):(\d{2})\s?(am|pm)?$/i);
    if (!m)
        return null;
    let hour = Number(m[1]);
    const minute = Number(m[2]);
    const meridiem = m[3]?.toLowerCase();
    if (hour > 23 || minute > 59)
        return null;
    if (meridiem === "pm" && hour < 12)
        hour += 12;
    if (meridiem === "am" && hour === 12)
        hour = 0;
    const now = new Date(nowMs);
    const target = new Date(now);
    target.setHours(hour, minute, 0, 0);
    if (target.getTime() <= nowMs)
        target.setDate(target.getDate() + 1);
    return target.getTime();
}
/**
 * Roadmap 12.7 — tek bir bekleme kararı (saf fonksiyon, zamanı kendisi ölçmez — `now`
 * enjekte edilir). `spend_limit` ya da sınıflandırılamayan hata için beklemek anlamsız
 * (`stop_unresolvable`) — roadmap 12.1/sınıflandırma notu: harcama limiti bekleyerek
 * çözülmez, yönetici müdahalesi gerekir.
 */
export function planLimitWait(classification, opts) {
    if (classification.kind === null || classification.kind === "spend_limit") {
        return { action: "stop_unresolvable", waitMs: 0, nextIntervalMs: 0 };
    }
    const maxWaitMs = opts.maxWaitHours * 3_600_000;
    const target = classification.resetHint
        ? resetHintToEpochMs(classification.resetHint, opts.now)
        : null;
    if (target !== null) {
        const waitMs = Math.max(0, target - opts.now);
        if (waitMs > maxWaitMs)
            return { action: "give_up", waitMs: 0, nextIntervalMs: 0 };
        return { action: "wait", waitMs, nextIntervalMs: 0 };
    }
    const nextIntervalMs = opts.previousIntervalMs
        ? Math.min(opts.previousIntervalMs * 2, MAX_INTERVAL_MS)
        : MIN_INTERVAL_MS;
    if (nextIntervalMs > maxWaitMs)
        return { action: "give_up", waitMs: 0, nextIntervalMs: 0 };
    return { action: "wait", waitMs: nextIntervalMs, nextIntervalMs };
}
