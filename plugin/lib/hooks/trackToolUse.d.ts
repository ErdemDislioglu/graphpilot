export interface PreToolUseHookInput {
    cwd?: string;
    session_id?: string;
    tool_name?: string;
    tool_input?: Record<string, unknown>;
}
export interface PreToolUseHookOutput {
    hookSpecificOutput?: {
        hookEventName: "PreToolUse";
        additionalContext: string;
    };
}
export type ToolUseCounters = Record<string, number>;
export interface ToolUseRecord {
    tool: string;
    target: string;
    count: number;
    /** Sadece `tool_name === "Write"` ve hedef dosya ÇAĞRIDAN ÖNCE zaten varsa `true`. */
    overwritesExisting?: boolean;
}
export interface TrackToolUseResult {
    output: PreToolUseHookOutput;
    updatedCounters: ToolUseCounters;
    /** `null` ise ölçülecek bir şey yok (izlenmeyen bir tool ya da eksik alan). */
    record: ToolUseRecord | null;
}
/**
 * Faz 7.2 (repo-map kullanımı), 7.7 (döngü tespiti) ve 7.9 (diff disiplini) ÖLÇÜMÜNÜ
 * tek bir PreToolUse hook'unda birleştirir (`matcher: "Read|Glob|Grep|Write|Bash"`).
 * Saf fonksiyon: I/O (sayaç dosyasını okuma/yazma, `.graph` varlığı, dosyanın önceden
 * var olup olmadığı) çağıran tarafın (CLI hook komutu) işi.
 *
 * Uyarı (`additionalContext` — research.md'de DOĞRULANAN alan) SADECE eşik tam
 * aşıldığı anda (`nextCount === 3`) bir kez üretilir — her tekrarda spam etmez.
 * `turn_limits` kapalıysa uyarı ÜRETİLMEZ ama sayaç/ölçüm kaydı yine de tutulur
 * (ölçüm, teknik açık/kapalı farkını karşılaştırabilsin diye tekniğin kendisinden ayrı).
 */
export declare function computeTrackToolUse(input: PreToolUseHookInput, gate: {
    graphDirExists: boolean;
    turnLimitsEnabled: boolean;
}, counters: ToolUseCounters, fileExistsBeforeWrite?: boolean): TrackToolUseResult;
