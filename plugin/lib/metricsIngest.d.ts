export interface TranscriptTurn {
    timestamp?: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    cacheCreationInputTokens: number;
    cacheReadInputTokens: number;
}
export interface TranscriptSummary {
    turns: number;
    byModel: Record<string, {
        turns: number;
        inputTokens: number;
        outputTokens: number;
        cacheCreationInputTokens: number;
        cacheReadInputTokens: number;
    }>;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCacheCreationInputTokens: number;
    totalCacheReadInputTokens: number;
    /** Faz 7.1'in ölçmeyi beklediği oran: cache_read / (input + cache_creation + cache_read). */
    cacheReadRatio: number | null;
}
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
export declare function parseTranscriptUsage(jsonlContent: string): TranscriptTurn[];
export declare function summarizeTranscript(turns: TranscriptTurn[]): TranscriptSummary;
