import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
/**
 * Atomik yazma: geçici dosya + rename (SPEC/Faz 2.6, 9.4) — kesintide bozuk dosya kalmaz.
 * `rename` aynı dosya sisteminde POSIX'te atomiktir.
 */
export function writeFileAtomic(filePath, content) {
    mkdirSync(dirname(filePath), { recursive: true });
    const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    writeFileSync(tmp, content, "utf-8");
    renameSync(tmp, filePath);
}
