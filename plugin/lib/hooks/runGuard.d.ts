/**
 * Faz 15 — `/gp:run` temiz oturum bekçisi. Ana thread her turda oturumun TÜM bağlamını
 * yeniden okur; `/gp:plan` konuşmasının üstüne `/gp:run` başlatmak bu yükü epic boyunca
 * taşır. Plugin `/clear`'ı çalıştıramaz (yerleşik komut), ama `UserPromptExpansion` hook'u
 * skill komutunu genişlemeden önce durdurabilir: https://code.claude.com/docs/en/hooks
 * ("UserPromptExpansion" — `command_name`, `transcript_path`, `decision: "block"` + `reason`).
 */
export interface RunGuardInput {
    command_name?: string;
    prompt?: string;
    session_id?: string;
    transcript_path?: string;
}
/** Komut adı biçimi dokümanda plugin için örneklenmiyor (DOĞRULANMADI) — yazılan satıra da bakılır. */
export declare function isGuardedCommand(input: RunGuardInput): boolean;
/**
 * Oturumun şu anki bağlamı: bu oturuma ait son assistant mesajının girdi token'ları
 * (`input + cache_read + cache_creation`). Dosyanın yalnız son 4 MB'ı okunur (uzun
 * oturumlarda transcript 30 MB+ olabiliyor). Bulunamazsa 0 — yani engelleme yok.
 */
export declare function readContextTokens(transcriptPath: string, sessionId?: string): number;
export type RunGuardOutput = Record<string, never> | {
    decision: "block";
    reason: string;
};
export declare function computeRunGuard(input: RunGuardInput, opts: {
    graphDirExists: boolean;
    thresholdTokens: number;
    contextTokens: (path: string, sessionId?: string) => number;
}): RunGuardOutput;
