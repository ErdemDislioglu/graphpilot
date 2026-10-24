/**
 * `## Hata geçmişi`'ne tek satır ekler (SPEC §5a) — `escalate.ts` ve `fail.ts` paylaşır.
 * Dosyayı taze okur (çağrı sırası önemli: önce frontmatter değişikliği, sonra bu).
 */
export declare function appendErrorHistoryLine(filePath: string, line: string): void;
