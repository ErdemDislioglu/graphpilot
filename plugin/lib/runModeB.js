import { execSync, spawnSync } from "node:child_process";
import { HTTP_429_RE } from "./autopilot/limitClassifier.js";
const RECOMMENDED_MARK_RE = /\s*\((önerilen|recommended)\)\s*$/i;
/**
 * `claude -p --output-format json` çıktısında agent'ın son mesajı `result` alanında
 * (code.claude.com/docs/en/headless — "Output formats"; alan adı DOĞRULANMADI, pilot
 * çıktısıyla uyumlu). JSON değilse ya da `result` yoksa ham stdout son mesaj sayılır.
 */
export function lastAgentMessage(stdout) {
    try {
        const parsed = JSON.parse(stdout);
        if (parsed && typeof parsed === "object" && typeof parsed.result === "string") {
            return parsed.result;
        }
    }
    catch {
        // JSON değil — düz metin çıktı
    }
    return stdout;
}
/**
 * Agent dönüş biçimi (plugin/skills/run/SKILL.md §2, agents/*.md): son mesajda satır başı
 * `blocked: <neden>`. Ek olarak (otopilot mimari karar sorusu) `soru: <metin>` ve en az iki
 * `seçenek: <metin>` satırı verilebilir — Telegram'da butonlara dönüşür.
 */
export function parseAgentReturn(message) {
    const blocked = /^blocked:[ \t]*(.*)$/im.exec(message);
    if (!blocked)
        return {};
    const blockedReason = blocked[1].trim() || "(neden belirtilmedi)";
    const questionText = /^soru:[ \t]*(.+)$/im.exec(message)?.[1].trim();
    const rawOptions = [...message.matchAll(/^seçenek:[ \t]*(.+)$/gim)].map((m) => m[1].trim()).filter(Boolean);
    if (!questionText || rawOptions.length < 2)
        return { blockedReason };
    const marked = rawOptions.findIndex((o) => RECOMMENDED_MARK_RE.test(o));
    const options = rawOptions.map((o) => o.replace(RECOMMENDED_MARK_RE, ""));
    const question = { text: questionText, options };
    if (marked !== -1)
        question.recommended = marked;
    return { blockedReason, question };
}
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
        ...minimalSessionArgs(agentDef.tools),
        "--output-format",
        "json",
    ];
}
/**
 * Faz 15 — headless oturumun sabit yükü. `--allowedTools` yalnız izin sormayı kaldırır,
 * araç listesini KISITLAMAZ: kullanıcının tüm MCP sunucuları ve skill listesi her
 * `claude -p` oturumuna yükleniyordu (plannerApp: prompt ~3k token iken ilk tur ~30k).
 * `--tools` yalnız agent'ın araçlarını bırakır, `--strict-mcp-config` (`--mcp-config`
 * verilmeden) MCP sunucularını, `--disable-slash-commands` skill listesini kapatır.
 * `--bare` değil: hook'ları da kapatır (ADR-001). Kaynak: `claude --help` (2.1.314);
 * token kazancı DOĞRULANMADI — bench ile ölçülecek.
 */
export function minimalSessionArgs(tools) {
    const list = tools
        .split(/[\s,]+/)
        .filter(Boolean)
        .join(",");
    return ["--tools", list, "--strict-mcp-config", "--disable-slash-commands"];
}
export function runNodeHeadless(contextMarkdown, agentDef, route, spawner = defaultSpawner) {
    const args = buildHeadlessArgs(contextMarkdown, agentDef, route);
    const { stdout, stderr, status } = spawner(args);
    if (status !== 0)
        return { ok: false, stdout, stderr: stderr ?? "", status };
    // Faz 12 — exit 0 "agent bitti" demek değil: agent `blocked:` dediyse görev done SAYILMAZ.
    const { blockedReason, question } = parseAgentReturn(lastAgentMessage(stdout));
    if (blockedReason === undefined)
        return { ok: true, stdout, stderr: stderr ?? "", status };
    return { ok: false, stdout, stderr: stderr ?? "", status, blocked: true, blockedReason, question };
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
        HTTP_429_RE.test(text) ||
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
        // `blocked` bir karar bekliyor — gerekçe metni "rate limit" içerse bile retry edilmez.
        if (result.ok || result.blocked)
            return { ...result, attempts, rateLimited: false };
        const rateLimited = isRateLimitSignal(`${result.stdout}\n${result.stderr}`);
        const canRetry = opts.enabled && rateLimited && attempts <= opts.maxRetries;
        if (!canRetry)
            return { ...result, attempts, rateLimited };
        sleep(opts.waitSeconds);
    }
}
