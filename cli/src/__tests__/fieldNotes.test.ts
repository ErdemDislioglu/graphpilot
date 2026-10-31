import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  addFieldNote,
  fieldNotesPath,
  normalizeTitle,
  parseFieldNotes,
  readFieldNotes,
  removeFieldNote,
  renderFieldNotes,
} from "../fieldNotes.js";
import { parseGraph } from "../graph/parser.js";
import { ConfigSchema } from "../schema/index.js";
import { withTempGraph } from "../testUtils/tempGraph.js";

const CONFIG = ConfigSchema.parse({
  routing: [{ when: {}, model: "haiku" }],
  escalation: ["haiku"],
  max_attempts_per_model: 1,
  budgets: { default_context: 8000, max_turns: 25 },
});
const withLimits = (field_notes: Record<string, unknown>) =>
  ConfigSchema.parse({ ...CONFIG, field_notes: { ...CONFIG.field_notes, ...field_notes } });

const NOTE = { level: "yuksek" as const, title: "gp complete boş Handoff'u kabul ediyor", body: "Öneri: şablon metni error.", seen: ["E02-F04-T09"] };

describe("normalizeTitle", () => {
  it("büyük/küçük harf, noktalama ve boşluk farkını yok sayar", () => {
    expect(normalizeTitle("  GP Complete — boş  Handoff'u!")).toBe(normalizeTitle("gp complete boş handoff u"));
  });
});

describe("parseFieldNotes / renderFieldNotes", () => {
  it("seviyeye göre gruplar, numaralar ve Görüldü satırını ayrı okur (gidiş-dönüş)", () => {
    const text = renderFieldNotes({
      header: "# Saha notları",
      unparsed: [],
      notes: [
        { level: "dusuk", title: "c", body: "x", seen: [] },
        { level: "yuksek", title: "a", body: "y", seen: ["T1", "T2"] },
      ],
    });
    expect(text).toContain("## Yüksek\n\n### 1. a\ny\nGörüldü: T1, T2");
    expect(text).toContain("## Düşük\n\n### 2. c\nx");
    const doc = parseFieldNotes(text);
    expect(doc.notes.map((n) => [n.level, n.title, n.seen])).toEqual([
      ["yuksek", "a", ["T1", "T2"]],
      ["dusuk", "c", []],
    ]);
    expect(doc.unparsed).toEqual([]);
  });

  it("seviye altında ### dışı satırı ve bilinmeyen ## başlığını unparsed sayar", () => {
    const doc = parseFieldNotes("# x\n\n## Düşük\n\n- madde\n\n## Notlar\n");
    expect(doc.unparsed).toEqual(["- madde", "## Notlar"]);
  });
});

describe("addFieldNote", () => {
  it("dosya yoksa oluşturur; graph parser onu düğüm saymaz", () => {
    withTempGraph({}, (_graph, dir) => {
      const result = addFieldNote(dir, NOTE, CONFIG);
      expect(result).toMatchObject({ status: "added", number: 1, total: 1 });
      expect(readFileSync(fieldNotesPath(dir), "utf-8")).toContain("### 1. gp complete boş Handoff'u kabul ediyor");
      const graph = parseGraph(dir);
      expect(graph.parseErrors).toEqual([]);
      expect(graph.nodesById.size).toBe(0);
    });
  });

  it("aynı başlık (normalize) → yeni madde açmaz, Görüldü'ye kanıt ekler", () => {
    withTempGraph({}, (_graph, dir) => {
      addFieldNote(dir, NOTE, CONFIG);
      const result = addFieldNote(dir, { ...NOTE, title: "GP complete boş handoff'u kabul ediyor.", body: "farklı", seen: ["E02-F04-T12", "E02-F04-T09"] }, CONFIG);
      expect(result).toEqual({ status: "merged", number: 1, seen: ["E02-F04-T09", "E02-F04-T12"], path: fieldNotesPath(dir) });
      const { notes } = readFieldNotes(dir);
      expect(notes).toHaveLength(1);
      expect(notes[0].body).toBe("Öneri: şablon metni error.");
    });
  });

  it("yeni not seviye sırasına girer, numara buna göre döner", () => {
    withTempGraph({}, (_graph, dir) => {
      addFieldNote(dir, { ...NOTE, level: "dusuk", title: "düşük" }, CONFIG);
      const result = addFieldNote(dir, { ...NOTE, title: "yüksek" }, CONFIG);
      expect(result).toMatchObject({ status: "added", number: 1, total: 2 });
    });
  });

  it("gövde token sınırını aşarsa reddeder", () => {
    withTempGraph({}, (_graph, dir) => {
      expect(() => addFieldNote(dir, { ...NOTE, body: "kelime ".repeat(200) }, withLimits({ max_note_tokens: 50 }))).toThrow(/max_note_tokens/);
      expect(existsSync(fieldNotesPath(dir))).toBe(false);
    });
  });

  it("max_entries doluysa reddeder (ama aynı başlığa birleştirme yine çalışır)", () => {
    withTempGraph({}, (_graph, dir) => {
      const config = withLimits({ max_entries: 1 });
      addFieldNote(dir, NOTE, config);
      expect(() => addFieldNote(dir, { ...NOTE, title: "başka" }, config)).toThrow(/max_entries/);
      expect(addFieldNote(dir, { ...NOTE, seen: ["T9"] }, config).status).toBe("merged");
    });
  });

  it("boş gövde, boş başlık reddedilir; enabled:false hiçbir şey yazmaz", () => {
    withTempGraph({}, (_graph, dir) => {
      expect(() => addFieldNote(dir, { ...NOTE, body: " " }, CONFIG)).toThrow(/gövdesi boş/);
      expect(() => addFieldNote(dir, { ...NOTE, title: " " }, CONFIG)).toThrow(/başlığı boş/);
      expect(addFieldNote(dir, NOTE, withLimits({ enabled: false }))).toEqual({ status: "disabled" });
      expect(existsSync(fieldNotesPath(dir))).toBe(false);
    });
  });

  it("elle eklenmiş biçim dışı içerik varsa üzerine yazmaz", () => {
    withTempGraph({}, (_graph, dir) => {
      const manual = "# Saha notları\n\n## Düşük\n\n- elle yazılmış madde\n";
      writeFileSync(fieldNotesPath(dir), manual);
      expect(() => addFieldNote(dir, NOTE, CONFIG)).toThrow(/biçim dışı/);
      expect(readFileSync(fieldNotesPath(dir), "utf-8")).toBe(manual);
    });
  });
});

describe("removeFieldNote", () => {
  it("numaraya göre çıkarır, kalanları yeniden numaralar; yoksa hata", () => {
    withTempGraph({}, (_graph, dir) => {
      addFieldNote(dir, NOTE, CONFIG);
      addFieldNote(dir, { ...NOTE, level: "orta", title: "ikinci" }, CONFIG);
      expect(removeFieldNote(dir, 1)).toEqual({ removed: NOTE.title, total: 1 });
      expect(readFileSync(fieldNotesPath(dir), "utf-8")).toContain("### 1. ikinci");
      expect(() => removeFieldNote(dir, 5)).toThrow(/böyle bir not yok/);
    });
  });
});
