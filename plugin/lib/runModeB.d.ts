import type { AgentDefinition } from "./agentFile.js";
export interface HeadlessRunResult {
    ok: boolean;
    stdout: string;
    stderr: string;
    status: number | null;
    /** Agent son mesajında `blocked: <neden>` dedi — exit 0 olsa da iş bitmedi. */
    blocked?: boolean;
    blockedReason?: string;
    /** `blocked` ile birlikte `soru:` + en az iki `seçenek:` satırı verildiyse (mimari karar). */
    question?: AgentQuestion;
}
export interface AgentQuestion {
    text: string;
    options: string[];
}
/**
 * `claude -p --output-format json` çıktısında agent'ın son mesajı `result` alanında
 * (code.claude.com/docs/en/headless — "Output formats"; alan adı DOĞRULANMADI, pilot
 * çıktısıyla uyumlu). JSON değilse ya da `result` yoksa ham stdout son mesaj sayılır.
 */
export declare function lastAgentMessage(stdout: string): string;
/**
 * Agent dönüş biçimi (plugin/skills/run/SKILL.md §2, agents/*.md): son mesajda satır başı
 * `blocked: <neden>`. Ek olarak (otopilot mimari karar sorusu) `soru: <metin>` ve en az iki
 * `seçenek: <metin>` satırı verilebilir — Telegram'da butonlara dönüşür.
 */
export declare function parseAgentReturn(message: string): {
    blockedReason?: string;
    question?: AgentQuestion;
};
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
/**
 * Faz 15 — headless oturumun sabit yükü. `--allowedTools` yalnız izin sormayı kaldırır,
 * araç listesini KISITLAMAZ: kullanıcının tüm MCP sunucuları ve skill listesi her
 * `claude -p` oturumuna yükleniyordu (plannerApp: prompt ~3k token iken ilk tur ~30k).
 * `--tools` yalnız agent'ın araçlarını bırakır, `--strict-mcp-config` (`--mcp-config`
 * verilmeden) MCP sunucularını, `--disable-slash-commands` skill listesini kapatır.
 * `--bare` değil: hook'ları da kapatır (ADR-001). Kaynak: `claude --help` (2.1.314);
 * token kazancı DOĞRULANMADI — bench ile ölçülecek.
 */
export declare function minimalSessionArgs(tools: string): string[];
export declare function runNodeHeadless(contextMarkdown: string, agentDef: AgentDefinition, route: {
    model: string;
    max_turns: number;
}, spawner?: ClaudeHeadlessSpawner): HeadlessRunResult;
/**
 * Roadmap 9.2 — "kullanım limiti/rate limit hatasını tanı". Faz 12.1'de (code.claude.com/
 * docs/en/errors, 2026-10-24'te gerçekten WebFetch ile okundu) GERÇEK hata metinleri
 * doğrulandı — artık tahmin değil: "You've hit your session limit", "...weekly limit",
 * "...Opus limit", "...Sonnet limit", "Server is temporarily limiting requests" (429 tarzı).
 * `claude -p --output-format json` çağrısında bu metnin TAM OLARAK HANGİ ALANDA
 * (stdout/stderr, hangi JSON alanı) çıkacağı hâlâ DOĞRULANMADI — doküman bunu belirtmiyor;
 * bu yüzden hem stdout hem stderr'e bakılıyor, savunmacı kalınıyor (Açık Soru #5, kısmen kapandı).
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
