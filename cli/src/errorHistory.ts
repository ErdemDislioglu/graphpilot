import { readFileSync } from "node:fs";
import matter from "gray-matter";
import { appendToSection } from "./markdown.js";
import { writeFileAtomic } from "./atomicWrite.js";

/**
 * `## Hata geçmişi`'ne tek satır ekler (SPEC §5a) — `escalate.ts` ve `fail.ts` paylaşır.
 * Dosyayı taze okur (çağrı sırası önemli: önce frontmatter değişikliği, sonra bu).
 */
export function appendErrorHistoryLine(filePath: string, line: string): void {
  const parsed = matter(readFileSync(filePath, "utf-8"));
  const newBody = appendToSection(parsed.content, "Hata geçmişi", line);
  writeFileAtomic(filePath, matter.stringify(newBody, parsed.data));
}
