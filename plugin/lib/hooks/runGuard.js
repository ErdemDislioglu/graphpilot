import { closeSync, fstatSync, openSync, readSync } from "node:fs";
const GUARDED = new Set(["gp:run", "gp:team"]);
const TAIL_BYTES = 4 * 1024 * 1024;
/** Komut adı biçimi dokümanda plugin için örneklenmiyor (DOĞRULANMADI) — yazılan satıra da bakılır. */
export function isGuardedCommand(input) {
    if (input.command_name && GUARDED.has(input.command_name))
        return true;
    const first = (input.prompt ?? "").trim().split(/\s+/)[0];
    return GUARDED.has(first.replace(/^\//, ""));
}
/**
 * Oturumun şu anki bağlamı: bu oturuma ait son assistant mesajının girdi token'ları
 * (`input + cache_read + cache_creation`). Dosyanın yalnız son 4 MB'ı okunur (uzun
 * oturumlarda transcript 30 MB+ olabiliyor). Bulunamazsa 0 — yani engelleme yok.
 */
export function readContextTokens(transcriptPath, sessionId) {
    let text;
    try {
        const fd = openSync(transcriptPath, "r");
        try {
            const size = fstatSync(fd).size;
            const length = Math.min(size, TAIL_BYTES);
            const buf = Buffer.alloc(length);
            readSync(fd, buf, 0, length, size - length);
            text = buf.toString("utf-8");
        }
        finally {
            closeSync(fd);
        }
    }
    catch {
        return 0;
    }
    const lines = text.split("\n");
    for (let i = lines.length - 1; i >= 0; i--) {
        let entry;
        try {
            entry = JSON.parse(lines[i]);
        }
        catch {
            continue;
        }
        if (entry.type !== "assistant" || entry.isSidechain)
            continue;
        if (sessionId && entry.sessionId && entry.sessionId !== sessionId)
            continue;
        const usage = entry.message?.usage;
        if (!usage || entry.message?.model === "<synthetic>")
            continue;
        return (usage.input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0);
    }
    return 0;
}
export function computeRunGuard(input, opts) {
    if (!opts.graphDirExists || opts.thresholdTokens <= 0 || !isGuardedCommand(input))
        return {};
    if (/(^|\s)--force(\s|$)/.test(input.prompt ?? ""))
        return {};
    if (!input.transcript_path)
        return {};
    const tokens = opts.contextTokens(input.transcript_path, input.session_id);
    if (tokens <= opts.thresholdTokens)
        return {};
    const k = Math.round(tokens / 1000);
    return {
        decision: "block",
        reason: `GraphPilot: bu oturumun bağlamı ~${k}k token; /gp:run her turda bunu yeniden okur. ` +
            `Önce /clear yap, sonra komutu tekrar yaz — graph kaldığı yerden devam eder. ` +
            `Yine de bu oturumda çalıştırmak için komutun sonuna --force ekle.`,
    };
}
