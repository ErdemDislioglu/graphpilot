import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { writeFileAtomic } from "./atomicWrite.js";
import { estimateTokens } from "./tokens.js";
import type { Config } from "./schema/index.js";

/**
 * Saha notları — plugin'in kendisiyle ilgili (proje kodu değil) bug/iyileştirme notları.
 * Elle tutulan `saha-notlari-versoApp.md` deneyiminden: dosya yalnız gerçekten önemli olanı
 * taşırsa işe yarıyor. "Yazmaya değer mi" kararı yöneticinin (skill kuralı); şişmeye karşı
 * sınırlar burada DETERMİNİSTİK: madde başına token, toplam madde sayısı, aynı başlık →
 * yeni madde değil "Görüldü" satırına ekleme.
 */
export const FIELD_NOTES_FILE = "saha-notlari.md";

export const NOTE_LEVELS = ["yuksek", "orta", "dusuk"] as const;
export type NoteLevel = (typeof NOTE_LEVELS)[number];

const LEVEL_HEADINGS: Record<NoteLevel, string> = { yuksek: "Yüksek", orta: "Orta", dusuk: "Düşük" };
const HEADING_TO_LEVEL = new Map(NOTE_LEVELS.map((l) => [LEVEL_HEADINGS[l], l]));
const SEEN_PREFIX = "Görüldü:";
const MAX_TITLE_CHARS = 100;

const DEFAULT_HEADER =
  "# Saha notları\n\nPlugin'in kendisiyle ilgili, gerçekten önemli bug ve iyileştirmeler (`gp note`). " +
  "Çözülenler `gp note remove` ile çıkarılır.";

export interface FieldNote {
  level: NoteLevel;
  title: string;
  /** Başlık altındaki metin (Görüldü satırı hariç), olduğu gibi. */
  body: string;
  seen: string[];
}

export interface FieldNotesDoc {
  header: string;
  notes: FieldNote[];
  /** `###` maddesine ya da seviye başlığına oturmayan satırlar — varsa dosya yeniden yazılmaz. */
  unparsed: string[];
}

export function fieldNotesPath(graphRoot: string): string {
  return join(graphRoot, FIELD_NOTES_FILE);
}

/** Başlık karşılaştırması: büyük/küçük harf, noktalama ve boşluk farkı yok sayılır. */
export function normalizeTitle(title: string): string {
  return title
    .toLocaleLowerCase("tr")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function parseFieldNotes(text: string): FieldNotesDoc {
  const lines = text.split("\n");
  const headerLines: string[] = [];
  const notes: FieldNote[] = [];
  const unparsed: string[] = [];
  let inBody = false;
  let level: NoteLevel | null = null;
  let current: { level: NoteLevel; title: string; lines: string[] } | null = null;

  const flush = () => {
    if (!current) return;
    const seenLine = current.lines.find((l) => l.startsWith(SEEN_PREFIX));
    const seen = seenLine
      ? seenLine
          .slice(SEEN_PREFIX.length)
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
    const body = current.lines.filter((l) => l !== seenLine).join("\n").trim();
    notes.push({ level: current.level, title: current.title, body, seen });
    current = null;
  };

  for (const line of lines) {
    const h2 = /^## (.+)$/.exec(line);
    if (h2) {
      flush();
      inBody = true;
      level = HEADING_TO_LEVEL.get(h2[1].trim()) ?? null;
      if (!level) unparsed.push(line);
      continue;
    }
    const h3 = /^### (?:\d+\.\s*)?(.+)$/.exec(line);
    if (h3 && level) {
      flush();
      current = { level, title: h3[1].trim(), lines: [] };
      continue;
    }
    if (current) current.lines.push(line);
    else if (!inBody) headerLines.push(line);
    else if (line.trim()) unparsed.push(line);
  }
  flush();
  return { header: headerLines.join("\n").trim() || DEFAULT_HEADER, notes, unparsed };
}

/** Seviyeye göre gruplar, maddeleri baştan sona numaralar (numara `gp note remove`'un argümanı). */
export function renderFieldNotes(doc: FieldNotesDoc): string {
  const out = [doc.header, ""];
  let n = 0;
  for (const level of NOTE_LEVELS) {
    const notes = doc.notes.filter((note) => note.level === level);
    if (notes.length === 0) continue;
    out.push(`## ${LEVEL_HEADINGS[level]}`, "");
    for (const note of notes) {
      n += 1;
      out.push(`### ${n}. ${note.title}`);
      if (note.body) out.push(note.body);
      if (note.seen.length > 0) out.push(`${SEEN_PREFIX} ${note.seen.join(", ")}`);
      out.push("");
    }
  }
  return `${out.join("\n").trimEnd()}\n`;
}

/** Render sırasıyla aynı (seviye gruplu) — numaralar bu listenin 1 tabanlı indeksidir. */
function ordered(doc: FieldNotesDoc): FieldNote[] {
  return NOTE_LEVELS.flatMap((level) => doc.notes.filter((n) => n.level === level));
}

export function readFieldNotes(graphRoot: string): FieldNotesDoc {
  const path = fieldNotesPath(graphRoot);
  const doc = existsSync(path)
    ? parseFieldNotes(readFileSync(path, "utf-8"))
    : { header: DEFAULT_HEADER, notes: [], unparsed: [] };
  return { ...doc, notes: ordered(doc) };
}

/** Elle eklenmiş, biçime uymayan içerik yeniden yazımda kaybolmasın diye yazmayı reddeder. */
function assertWritable(doc: FieldNotesDoc): void {
  if (doc.unparsed.length > 0) {
    throw new Error(
      `${FIELD_NOTES_FILE} biçim dışı satır içeriyor (ilk: "${doc.unparsed[0].trim()}") — ` +
        "maddeleri `## Yüksek|Orta|Düşük` altında `### başlık` olarak düzenle, sonra tekrar dene",
    );
  }
}

export interface AddNoteInput {
  level: NoteLevel;
  title: string;
  body: string;
  seen?: string[];
}

export type AddNoteResult =
  | { status: "added"; number: number; total: number; path: string }
  | { status: "merged"; number: number; seen: string[]; path: string }
  | { status: "disabled" };

export function addFieldNote(graphRoot: string, input: AddNoteInput, config: Config): AddNoteResult {
  const limits = config.field_notes;
  if (!limits.enabled) return { status: "disabled" };
  const title = input.title.trim();
  if (!title) throw new Error("not başlığı boş");
  if (title.length > MAX_TITLE_CHARS) throw new Error(`not başlığı ${MAX_TITLE_CHARS} karakteri aşıyor`);

  const doc = readFieldNotes(graphRoot);
  assertWritable(doc);
  const seen = (input.seen ?? []).map((s) => s.trim()).filter(Boolean);
  const path = fieldNotesPath(graphRoot);

  const idx = doc.notes.findIndex((n) => normalizeTitle(n.title) === normalizeTitle(title));
  if (idx !== -1) {
    // Aynı sorun tekrar görüldü: yeni madde açılmaz, kanıt eklenir (dosya şişmez).
    const note = doc.notes[idx];
    note.seen = [...new Set([...note.seen, ...seen])];
    writeFileAtomic(path, renderFieldNotes(doc));
    return { status: "merged", number: idx + 1, seen: note.seen, path };
  }

  const body = input.body.trim();
  if (!body) throw new Error("not gövdesi boş — sorun, etki ve öneri yaz");
  const tokens = estimateTokens(body);
  if (tokens > limits.max_note_tokens) {
    throw new Error(`not ~${tokens} token, sınır ${limits.max_note_tokens} (field_notes.max_note_tokens) — kısalt`);
  }
  if (doc.notes.length >= limits.max_entries) {
    throw new Error(
      `saha notları dolu (${doc.notes.length}/${limits.max_entries}, field_notes.max_entries) — ` +
        "önce çözüleni `gp note remove` ile çıkar ya da bu notu daha önemsiz bir notun yerine koy",
    );
  }

  doc.notes.push({ level: input.level, title, body, seen });
  const next = { ...doc, notes: ordered(doc) };
  writeFileAtomic(path, renderFieldNotes(next));
  return { status: "added", number: next.notes.findIndex((n) => n.title === title) + 1, total: next.notes.length, path };
}

export function removeFieldNote(graphRoot: string, number: number): { removed: string; total: number } {
  const doc = readFieldNotes(graphRoot);
  assertWritable(doc);
  const note = doc.notes[number - 1];
  if (!note) throw new Error(`böyle bir not yok: ${number} (toplam ${doc.notes.length})`);
  doc.notes.splice(number - 1, 1);
  writeFileAtomic(fieldNotesPath(graphRoot), renderFieldNotes(doc));
  return { removed: note.title, total: doc.notes.length };
}
