import type { Graph } from "./graph/types.js";
export interface StatusChange {
    id: string;
    from: string;
    to: string;
}
/**
 * Faz 14 B2 — feature/epic `status`'unu task'lardan türetir. Eskiden hiçbir mekanizma
 * epic/feature'ı `done`'a çekmiyordu: 18 task'ın hepsi bitince `gp status` hâlâ 9 `pending`
 * gösteriyordu. "Bitti" tanımı `computeFeatureDone`/`computeEpicDone` ile aynıdır (B3:
 * genişletilmemiş çocuk varken epic bitmez). Bitmiş sayılmayan ama `done` yazan düğüm
 * (ör. sonradan yeni task eklendi) `pending`'e döner. Deterministik: ID sırasıyla.
 */
export declare function computeRollup(graph: Graph): StatusChange[];
/** `computeRollup`'ın değişikliklerini diske yazar ve döndürür. */
export declare function applyRollup(graph: Graph): StatusChange[];
