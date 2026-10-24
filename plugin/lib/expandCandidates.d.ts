import type { Graph } from "./graph/types.js";
export interface ExpandCandidate {
    id: string;
    kind: "epic" | "feature";
}
/**
 * SPEC/roadmap 6.1 — `/gp:run`'ın "ready yoksa açılmamış feature/epic var mı" kontrolü
 * için deterministik yanıt. Bir epic/feature "genişletilmeye hazır" sayılır:
 * `expanded: false` VE `depends_on`'ları (aynı türden) hepsi `done` (ya da boş).
 * Epic'ler feature'lardan önce gelir (deterministik sıralama) — bir epic henüz
 * genişletilmediyse altındaki feature'lar zaten yoktur.
 */
export declare function findExpandCandidates(graph: Graph): ExpandCandidate[];
