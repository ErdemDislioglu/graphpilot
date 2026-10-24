import type { LimitClassification } from "./limitClassifier.js";
export type LimitWaitAction = "wait" | "give_up" | "stop_unresolvable";
export interface LimitWaitPlan {
    action: LimitWaitAction;
    /** `action: "wait"` iken beklenecek milisaniye. */
    waitMs: number;
    /** `resetHint` okunamadığında, BİR SONRAKİ `planLimitWait` çağrısına `previousIntervalMs`
     * olarak geri verilecek değer (roadmap 12.1: "okunamıyorsa artan aralıklarla yeniden dene"). */
    nextIntervalMs: number;
}
/**
 * "3:14am" / "14:20" → BUGÜN (ya da saat zaten geçtiyse YARIN) o saate denk gelen mutlak
 * epoch ms. Biçim belirsiz/anlaşılmazsa `null` (tahmin etmez — çağıran artan aralığa düşer).
 */
export declare function resetHintToEpochMs(resetHint: string, nowMs: number): number | null;
/**
 * Roadmap 12.7 — tek bir bekleme kararı (saf fonksiyon, zamanı kendisi ölçmez — `now`
 * enjekte edilir). `spend_limit` ya da sınıflandırılamayan hata için beklemek anlamsız
 * (`stop_unresolvable`) — roadmap 12.1/sınıflandırma notu: harcama limiti bekleyerek
 * çözülmez, yönetici müdahalesi gerekir.
 */
export declare function planLimitWait(classification: LimitClassification, opts: {
    maxWaitHours: number;
    previousIntervalMs?: number;
    now: number;
}): LimitWaitPlan;
