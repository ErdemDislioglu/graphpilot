import { execSync, spawnSync } from "node:child_process";
const defaultSpawner = (args) => {
    const result = spawnSync("claude", args, { encoding: "utf-8" });
    return { stdout: result.stdout ?? "", stderr: result.stderr ?? "", status: result.status };
};
/**
 * Mod B (6.9, ADR-001) — `claude -p` çağrısının argümanlarını kurar. `--bare`
 * KULLANILMAZ (ADR-001: abonelik login'ini korumak için). Bu, Mod B'nin **ilk/temel**
 * sürümü: doğrulama döngüsü/escalation entegre DEĞİL — her düğüm için tek deneme.
 * Tam dayanıklı sürüm ileride (Faz 9 kapsamında) bu fonksiyonun üzerine inşa edilir.
 */
export function buildHeadlessArgs(contextMarkdown, agentDef, route) {
    return [
        "-p",
        contextMarkdown,
        "--model",
        route.model,
        "--max-turns",
        String(route.max_turns),
        "--append-system-prompt",
        agentDef.systemPrompt,
        "--allowedTools",
        agentDef.tools,
        "--output-format",
        "json",
    ];
}
export function runNodeHeadless(contextMarkdown, agentDef, route, spawner = defaultSpawner) {
    const args = buildHeadlessArgs(contextMarkdown, agentDef, route);
    const { stdout, stderr, status } = spawner(args);
    return { ok: status === 0, stdout, stderr: stderr ?? "", status };
}
/**
 * Roadmap 9.2 — "kullanım limiti/rate limit hatasını tanı". Faz 12.1'de (code.claude.com/
 * docs/en/errors, 2026-10-24'te gerçekten WebFetch ile okundu) GERÇEK hata metinleri
 * doğrulandı — artık tahmin değil: "You've hit your session limit", "...weekly limit",
 * "...Opus limit", "...Sonnet limit", "Server is temporarily limiting requests" (429 tarzı).
 * `claude -p --output-format json` çağrısında bu metnin TAM OLARAK HANGİ ALANDA
 * (stdout/stderr, hangi JSON alanı) çıkacağı hâlâ DOĞRULANMADI — doküman bunu belirtmiyor;
 * bu yüzden hem stdout hem stderr'e bakılıyor, savunmacı kalınıyor (Açık Soru #5, kısmen kapandı).
 */
export function isRateLimitSignal(text) {
    const lower = text.toLowerCase();
    return ((lower.includes("hit your") && (lower.includes("limit") || lower.includes("budget"))) ||
        lower.includes("rate limit") ||
        lower.includes("rate_limit") ||
        lower.includes("usage limit") ||
        lower.includes("temporarily limiting requests") ||
        lower.includes("429") ||
        (lower.includes("quota") && lower.includes("exceeded")));
}
/**
 * Roadmap 9.2 — rate limit'te "güvenli noktada dur, durumu kaydet" + (Mod B'de)
 * "bekleyip otomatik yeniden deneme" (`config.yml` ile açılıp kapatılabilir).
 * `sleep` enjekte edilebilir — testte gerçekten beklemeyi önler.
 */
export function runNodeHeadlessWithRetry(contextMarkdown, agentDef, route, opts, spawner = defaultSpawner, 
// Node'da yerleşik senkron bir uyuma yok; rest of CLI senkron (async/await yok) olduğu
// için en basit taşınabilir çözüm kabuğun kendi `sleep`'ini çağırmak — testte enjekte edilir.
sleep = (s) => execSync(`sleep ${s}`)) {
    let attempts = 0;
    for (;;) {
        attempts += 1;
        const result = runNodeHeadless(contextMarkdown, agentDef, route, spawner);
        if (result.ok)
            return { ...result, attempts, rateLimited: false };
        const rateLimited = isRateLimitSignal(`${result.stdout}\n${result.stderr}`);
        const canRetry = opts.enabled && rateLimited && attempts <= opts.maxRetries;
        if (!canRetry)
            return { ...result, attempts, rateLimited };
        sleep(opts.waitSeconds);
    }
}
