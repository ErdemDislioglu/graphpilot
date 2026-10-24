import { readFileSync } from "node:fs";
import { join } from "node:path";
import { writeFileAtomic } from "./atomicWrite.js";

/**
 * `gp brief --file <path>` — planner'ın (Write aracı YOK, sadece Read/Glob/Grep/Bash,
 * kasıtlı — SPEC/roadmap 3.3) brief.md'nin gerçek içeriğini yazma yolu. Planner içeriği
 * Bash üzerinden (heredoc) bir geçici dosyaya yazar, bu komut onu `.graph/brief.md`'ye
 * **değiştirerek** kopyalar (`gp init`'in aksine idempotent DEĞİL — planner'ın ürettiği
 * gerçek içerik, `gp init`'in placeholder'ının üzerine kasıtlı olarak yazılır).
 *
 * Token/bölüm kontrolü burada YAPILMAZ — `gp validate` ayrı bir komut (tek sorumluluk).
 */
export function setBrief(graphRootDir: string, sourceFilePath: string): void {
  const content = readFileSync(sourceFilePath, "utf-8");
  writeFileAtomic(join(graphRootDir, "brief.md"), content);
}
