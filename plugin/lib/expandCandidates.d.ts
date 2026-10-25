import type { Graph } from "./graph/types.js";
export interface ExpandCandidate {
    id: string;
    kind: "epic" | "feature";
}
/**
 * SPEC/roadmap 6.1 — `/gp:run`'ın "ready yoksa açılmamış feature/epic var mı" kontrolü
 * için deterministik yanıt. Bir epic/feature "genişletilmeye hazır" sayılır:
 * `expanded: false` VE `depends_on`'ları (aynı türden) hepsi gerçekten bitmiş (bkz.
 * `isDependencyDone` — epic/feature bağımlılıkları için altındaki task'lara bakılır).
 * Feature'lar epic'lerden önce gelir, her grup kendi içinde ID'ye göre (deterministik).
 * Faz 14 B3: eskiden epic'ler öndeydi → E02-F02 genişletilmeden yeni bir epic (E03)
 * açılıyordu. Feature'lar yalnız genişletilmiş epic'lerin altında var olduğundan bu
 * sıra "başlanmış epic'i önce bitir" demektir; `/gp:run` ilk adayı genişletir.
 */
export declare function findExpandCandidates(graph: Graph): ExpandCandidate[];
