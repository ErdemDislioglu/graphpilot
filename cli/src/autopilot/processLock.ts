import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Roadmap 12 (mimari) — "Durum dosyalarda: Otopilot durumu `.graph/_runtime/autopilot.json`'da
 * tutulur". Aynı dosya roadmap 12.10'un "ikinci bir sürecin başlatılmasını engelleyen kilit
 * dosyası" rolünü de görür — ayrı bir `.lock` dosyasına gerek yok. */
export interface AutopilotLockInfo {
  pid: number;
  startedAt: string;
}

function lockPath(graphRootDir: string): string {
  return join(graphRootDir, "_runtime", "autopilot.json");
}

export function readLock(graphRootDir: string): AutopilotLockInfo | null {
  const path = lockPath(graphRootDir);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf-8")) as AutopilotLockInfo;
}

export function writeLock(graphRootDir: string, pid: number): void {
  const dir = join(graphRootDir, "_runtime");
  mkdirSync(dir, { recursive: true });
  const info: AutopilotLockInfo = { pid, startedAt: new Date().toISOString() };
  writeFileSync(lockPath(graphRootDir), JSON.stringify(info, null, 2));
}

export function removeLock(graphRootDir: string): void {
  const path = lockPath(graphRootDir);
  if (existsSync(path)) unlinkSync(path);
}

/**
 * `process.kill(pid, 0)` sürece sinyal GÖNDERMEZ — sadece var olup olmadığını sorar
 * (süreç yoksa `ESRCH` fırlatır). Enjekte edilebilir — testte gerçek bir PID'e
 * dokunmadan sahte canlı/ölü döner.
 */
export function isProcessAlive(
  pid: number,
  kill: (pid: number, signal: 0) => void = process.kill.bind(process),
): boolean {
  try {
    kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export interface LockCheckResult {
  /** `true`: başka bir süreç gerçekten çalışıyor — YENİ bir `start` reddedilmeli. */
  locked: boolean;
  /** `true`: kilit dosyası var ama PID artık yaşamıyor (önceki süreç çökmüş) — `start`
   * bunu engel SAYMAZ, kilidi temizleyip devam eder. */
  stale: boolean;
  info: AutopilotLockInfo | null;
}

export function checkLock(
  graphRootDir: string,
  isAlive: (pid: number) => boolean = isProcessAlive,
): LockCheckResult {
  const info = readLock(graphRootDir);
  if (!info) return { locked: false, stale: false, info: null };
  const alive = isAlive(info.pid);
  return { locked: alive, stale: !alive, info };
}
