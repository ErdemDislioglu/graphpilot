import type { AgentDefinition } from "./agentFile.js";
export interface HeadlessRunResult {
    ok: boolean;
    stdout: string;
    stderr: string;
    status: number | null;
}
export type ClaudeHeadlessSpawner = (args: string[]) => {
    stdout: string;
    stderr?: string;
    status: number | null;
};
/**
 * Mod B (6.9, ADR-001) — `claude -p` çağrısının argümanlarını kurar. `--bare`
 * KULLANILMAZ (ADR-001: abonelik login'ini korumak için). Bu, Mod B'nin **ilk/temel**
 * sürümü: doğrulama döngüsü/escalation entegre DEĞİL — her düğüm için tek deneme.
 * Tam dayanıklı sürüm ileride (Faz 9 kapsamında) bu fonksiyonun üzerine inşa edilir.
 */
export declare function buildHeadlessArgs(contextMarkdown: string, agentDef: AgentDefinition, route: {
    model: string;
    max_turns: number;
}): string[];
export declare function runNodeHeadless(contextMarkdown: string, agentDef: AgentDefinition, route: {
    model: string;
    max_turns: number;
}, spawner?: ClaudeHeadlessSpawner): HeadlessRunResult;
/**
 * Roadmap 9.2 — "kullanım limiti/rate limit hatasını tanı". ❗ **DOĞRULANMADI:** bu
 * oturumda gerçek bir 429/kullanım-limiti yanıtı hiç gözlenmedi (research.md Açık Soru
 * #5 — abonelik kota kuralları hâlâ belirsiz); bu yüzden savunmacı/en-iyi-çaba bir desen
 * eşleştirmesi — yaygın görülen birkaç anahtar kelimeyi arar. Eşleşme YOKSA normal
 * başarısızlık sayılır (yanlış pozitiften kaçınmak yanlış negatiften daha güvenli: bir
 * gerçek hatayı "rate limit" sanıp sonsuz beklemek, bir rate limit'i normal hata sanıp
 * düğümü yanlışlıkla `failed` işaretlemekten daha kötü sonuç verir).
 */
export declare function isRateLimitSignal(text: string): boolean;
export interface RateLimitRetryOptions {
    enabled: boolean;
    waitSeconds: number;
    maxRetries: number;
}
export interface RetryableHeadlessResult extends HeadlessRunResult {
    attempts: number;
    /** Son denemede de rate-limit sinyali görüldü mü — true ise `ok:false` görmezden
     * gelinmemeli: düğüm `failed` değil, geçici bir kesinti olarak ele alınmalı (9.2). */
    rateLimited: boolean;
}
/**
 * Roadmap 9.2 — rate limit'te "güvenli noktada dur, durumu kaydet" + (Mod B'de)
 * "bekleyip otomatik yeniden deneme" (`config.yml` ile açılıp kapatılabilir).
 * `sleep` enjekte edilebilir — testte gerçekten beklemeyi önler.
 */
export declare function runNodeHeadlessWithRetry(contextMarkdown: string, agentDef: AgentDefinition, route: {
    model: string;
    max_turns: number;
}, opts: RateLimitRetryOptions, spawner?: ClaudeHeadlessSpawner, sleep?: (seconds: number) => void): RetryableHeadlessResult;
