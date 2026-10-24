/**
 * Faz 8.1 — transcript JSONL'den gerçek token kullanımını çıkarır. Alan adları
 * DOKÜMANE EDİLMİŞ bir API değil — bu projenin kendi gerçek oturum kayıtları
 * incelenerek doğrulandı (ADR-012, `docs/SPEC.md` §13). Bu yüzden savunmacı:
 * bilinmeyen/eksik alan → 0 ya da atla, asla fırlatmaz (sürümler arası format
 * değişebilir, tek bir bozuk satır tüm ingest'i düşürmemeli).
 *
 * Sadece GERÇEK model çağrılarını sayar — `message.model === "<synthetic>"` olan
 * satırlar (hata/sistem mesajları, ör. "Login expired") atlanır; bunların `usage`'ı
 * hep 0'dır ve gerçek bir API kullanımını temsil etmez.
 */
export function parseTranscriptUsage(jsonlContent) {
    const turns = [];
    for (const line of jsonlContent.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed)
            continue;
        let obj;
        try {
            obj = JSON.parse(trimmed);
        }
        catch {
            continue;
        }
        if (typeof obj !== "object" || obj === null)
            continue;
        const record = obj;
        if (record.type !== "assistant")
            continue;
        const message = record.message;
        const model = message?.model;
        if (typeof model !== "string" || model === "<synthetic>")
            continue;
        const usage = message?.usage;
        if (!usage)
            continue;
        turns.push({
            timestamp: typeof record.timestamp === "string" ? record.timestamp : undefined,
            model,
            inputTokens: numberOr0(usage.input_tokens),
            outputTokens: numberOr0(usage.output_tokens),
            cacheCreationInputTokens: numberOr0(usage.cache_creation_input_tokens),
            cacheReadInputTokens: numberOr0(usage.cache_read_input_tokens),
        });
    }
    return turns;
}
function numberOr0(v) {
    return typeof v === "number" && Number.isFinite(v) ? v : 0;
}
export function summarizeTranscript(turns) {
    const byModel = {};
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCacheCreationInputTokens = 0;
    let totalCacheReadInputTokens = 0;
    for (const t of turns) {
        const bucket = (byModel[t.model] ??= {
            turns: 0,
            inputTokens: 0,
            outputTokens: 0,
            cacheCreationInputTokens: 0,
            cacheReadInputTokens: 0,
        });
        bucket.turns += 1;
        bucket.inputTokens += t.inputTokens;
        bucket.outputTokens += t.outputTokens;
        bucket.cacheCreationInputTokens += t.cacheCreationInputTokens;
        bucket.cacheReadInputTokens += t.cacheReadInputTokens;
        totalInputTokens += t.inputTokens;
        totalOutputTokens += t.outputTokens;
        totalCacheCreationInputTokens += t.cacheCreationInputTokens;
        totalCacheReadInputTokens += t.cacheReadInputTokens;
    }
    const totalInputSide = totalInputTokens + totalCacheCreationInputTokens + totalCacheReadInputTokens;
    return {
        turns: turns.length,
        byModel,
        totalInputTokens,
        totalOutputTokens,
        totalCacheCreationInputTokens,
        totalCacheReadInputTokens,
        cacheReadRatio: totalInputSide > 0 ? totalCacheReadInputTokens / totalInputSide : null,
    };
}
