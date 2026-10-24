import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
function lockPath(graphRootDir) {
    return join(graphRootDir, "_runtime", "autopilot.json");
}
export function readLock(graphRootDir) {
    const path = lockPath(graphRootDir);
    if (!existsSync(path))
        return null;
    return JSON.parse(readFileSync(path, "utf-8"));
}
export function writeLock(graphRootDir, pid) {
    const dir = join(graphRootDir, "_runtime");
    mkdirSync(dir, { recursive: true });
    const info = { pid, startedAt: new Date().toISOString() };
    writeFileSync(lockPath(graphRootDir), JSON.stringify(info, null, 2));
}
export function removeLock(graphRootDir) {
    const path = lockPath(graphRootDir);
    if (existsSync(path))
        unlinkSync(path);
}
/**
 * `process.kill(pid, 0)` sürece sinyal GÖNDERMEZ — sadece var olup olmadığını sorar
 * (süreç yoksa `ESRCH` fırlatır). Enjekte edilebilir — testte gerçek bir PID'e
 * dokunmadan sahte canlı/ölü döner.
 */
export function isProcessAlive(pid, kill = process.kill.bind(process)) {
    try {
        kill(pid, 0);
        return true;
    }
    catch {
        return false;
    }
}
export function checkLock(graphRootDir, isAlive = isProcessAlive) {
    const info = readLock(graphRootDir);
    if (!info)
        return { locked: false, stale: false, info: null };
    const alive = isAlive(info.pid);
    return { locked: alive, stale: !alive, info };
}
