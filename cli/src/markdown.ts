/**
 * Paylaşılan markdown bölüm yardımcıları. `validate.ts` (Handoff/brief token sınırı),
 * `context.ts` (bağımlılıkların sadece Handoff'u), `resumeSummary.ts` (Yarım iş/Hata
 * geçmişi) ve `escalate.ts`/`fail.ts` (Faz 6 — Hata geçmişine satır ekleme) kullanır.
 */

interface SectionBounds {
  /** Başlık satırının kendisi (0-indeksli). */
  headingLine: number;
  /** İçeriğin başladığı satır (başlıktan sonraki satır). */
  start: number;
  /** İçeriğin bittiği satır (bir sonraki `#`/`##` başlığı ya da dosya sonu). */
  end: number;
}

function findSection(lines: string[], heading: string): SectionBounds | null {
  const startRe = new RegExp(`^##\\s+${escapeRegExp(heading)}\\s*$`);
  let headingLine = -1;
  for (let i = 0; i < lines.length; i++) {
    if (startRe.test(lines[i])) {
      headingLine = i;
      break;
    }
  }
  if (headingLine === -1) return null;

  let end = lines.length;
  for (let i = headingLine + 1; i < lines.length; i++) {
    if (/^#{1,2}\s+/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return { headingLine, start: headingLine + 1, end };
}

/**
 * `## <heading>` başlığından, aynı veya daha üst seviyede bir sonraki `#` başlığına
 * (veya dosya sonuna) kadar olan gövdeyi döndürür. Başlık yoksa `null`.
 */
export function extractSection(body: string, heading: string): string | null {
  const lines = body.split("\n");
  const section = findSection(lines, heading);
  if (!section) return null;
  return lines.slice(section.start, section.end).join("\n").trim();
}

/**
 * SPEC/roadmap 6.5, 6.7 — `## Hata geçmişi` / `## Yarım iş` gibi bölümlere tek satır
 * ekler. Başlık yoksa gövdenin sonuna oluşturur. Bölüm sadece bir placeholder
 * (`*(...)*`) içeriyorsa onun üzerine yazar, gerçek içerik varsa SONUNA ekler.
 */
export function appendToSection(body: string, heading: string, line: string): string {
  const lines = body.split("\n");
  const section = findSection(lines, heading);

  if (!section) {
    const sep = body.endsWith("\n") ? "" : "\n";
    return `${body}${sep}\n## ${heading}\n\n- ${line}\n`;
  }

  const existingLines = lines
    .slice(section.start, section.end)
    .map((l) => l.trim())
    .filter((l) => l !== "" && !l.startsWith("*("));
  const newContent = [...existingLines, `- ${line}`].join("\n");

  return [...lines.slice(0, section.start), "", newContent, "", ...lines.slice(section.end)]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
