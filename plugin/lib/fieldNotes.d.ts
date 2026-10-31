import type { Config } from "./schema/index.js";
/**
 * Saha notları — plugin'in kendisiyle ilgili (proje kodu değil) bug/iyileştirme notları.
 * Elle tutulan `saha-notlari-versoApp.md` deneyiminden: dosya yalnız gerçekten önemli olanı
 * taşırsa işe yarıyor. "Yazmaya değer mi" kararı yöneticinin (skill kuralı); şişmeye karşı
 * sınırlar burada DETERMİNİSTİK: madde başına token, toplam madde sayısı, aynı başlık →
 * yeni madde değil "Görüldü" satırına ekleme.
 */
export declare const FIELD_NOTES_FILE = "saha-notlari.md";
export declare const NOTE_LEVELS: readonly ["yuksek", "orta", "dusuk"];
export type NoteLevel = (typeof NOTE_LEVELS)[number];
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
export declare function fieldNotesPath(graphRoot: string): string;
/** Başlık karşılaştırması: büyük/küçük harf, noktalama ve boşluk farkı yok sayılır. */
export declare function normalizeTitle(title: string): string;
export declare function parseFieldNotes(text: string): FieldNotesDoc;
/** Seviyeye göre gruplar, maddeleri baştan sona numaralar (numara `gp note remove`'un argümanı). */
export declare function renderFieldNotes(doc: FieldNotesDoc): string;
export declare function readFieldNotes(graphRoot: string): FieldNotesDoc;
export interface AddNoteInput {
    level: NoteLevel;
    title: string;
    body: string;
    seen?: string[];
}
export type AddNoteResult = {
    status: "added";
    number: number;
    total: number;
    path: string;
} | {
    status: "merged";
    number: number;
    seen: string[];
    path: string;
} | {
    status: "disabled";
};
export declare function addFieldNote(graphRoot: string, input: AddNoteInput, config: Config): AddNoteResult;
export declare function removeFieldNote(graphRoot: string, number: number): {
    removed: string;
    total: number;
};
