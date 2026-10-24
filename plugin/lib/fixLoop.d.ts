export interface FixLoopRound {
    round: number;
    issuesCount: number;
    tokens?: number;
}
/** SPEC/roadmap 6.3 — her tur `_metrics`'e ayrı kayıt (tur no, eksik sayısı, token). */
export declare function recordFixLoopRound(graphRootDir: string, nodeId: string, round: FixLoopRound): void;
export declare function readFixLoopRounds(graphRootDir: string, nodeId: string): FixLoopRound[];
export interface FixLoopStatus {
    shouldBreak: boolean;
    reason: string;
    converged: boolean;
    roundsUsed: number;
}
/**
 * SPEC/roadmap 6.3 "Frenler" — tur sınırı, yakınsama kontrolü, tur başına token bütçesi.
 * Saf fonksiyon: geçmiş turların listesini alır, "devam et mi, kır mı" kararını döner.
 * Orkestratör her turdan sonra bunu çağırır — kendi muhakemesine güvenmez (deterministik).
 */
export declare function computeFixLoopStatus(rounds: FixLoopRound[], opts: {
    maxRounds: number;
    nodeBudget?: number;
    breakIfNoProgress: boolean;
}): FixLoopStatus;
export interface FixLoopTokenRatio {
    firstRoundTokens: number;
    laterRoundsTokens: number;
    /** `laterRoundsTokens / firstRoundTokens` — null ise ilk tur token'ı 0/bilinmiyor. */
    ratio: number | null;
}
/**
 * Roadmap 7.8 — "Ölç: tur başına token, ilk tur ile sonraki turların oranı". Düşük oran
 * (sonraki turlar ilk turdan çok daha az token kullanıyor) doğrulama döngüsünün
 * "sadece eksik listesi gönder" ilkesinin (6.3) işe yaradığının kanıtıdır.
 */
export declare function computeFixLoopTokenRatio(rounds: FixLoopRound[]): FixLoopTokenRatio;
