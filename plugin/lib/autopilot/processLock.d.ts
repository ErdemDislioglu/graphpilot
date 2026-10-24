/** Roadmap 12 (mimari) — "Durum dosyalarda: Otopilot durumu `.graph/_runtime/autopilot.json`'da
 * tutulur". Aynı dosya roadmap 12.10'un "ikinci bir sürecin başlatılmasını engelleyen kilit
 * dosyası" rolünü de görür — ayrı bir `.lock` dosyasına gerek yok. */
export interface AutopilotLockInfo {
    pid: number;
    startedAt: string;
}
export declare function readLock(graphRootDir: string): AutopilotLockInfo | null;
export declare function writeLock(graphRootDir: string, pid: number): void;
export declare function removeLock(graphRootDir: string): void;
/**
 * `process.kill(pid, 0)` sürece sinyal GÖNDERMEZ — sadece var olup olmadığını sorar
 * (süreç yoksa `ESRCH` fırlatır). Enjekte edilebilir — testte gerçek bir PID'e
 * dokunmadan sahte canlı/ölü döner.
 */
export declare function isProcessAlive(pid: number, kill?: (pid: number, signal: 0) => void): boolean;
export interface LockCheckResult {
    /** `true`: başka bir süreç gerçekten çalışıyor — YENİ bir `start` reddedilmeli. */
    locked: boolean;
    /** `true`: kilit dosyası var ama PID artık yaşamıyor (önceki süreç çökmüş) — `start`
     * bunu engel SAYMAZ, kilidi temizleyip devam eder. */
    stale: boolean;
    info: AutopilotLockInfo | null;
}
export declare function checkLock(graphRootDir: string, isAlive?: (pid: number) => boolean): LockCheckResult;
