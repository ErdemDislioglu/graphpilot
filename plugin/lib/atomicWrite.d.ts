/**
 * Atomik yazma: geçici dosya + rename (SPEC/Faz 2.6, 9.4) — kesintide bozuk dosya kalmaz.
 * `rename` aynı dosya sisteminde POSIX'te atomiktir.
 */
export declare function writeFileAtomic(filePath: string, content: string): void;
