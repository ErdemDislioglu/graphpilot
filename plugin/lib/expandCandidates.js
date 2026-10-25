import { getDependsOn } from "./graph/types.js";
import { computeEpicDone, computeFeatureDone } from "./epicStatus.js";
/**
 * 2026-10-25 — gerçek bir test projesinde bulundu: bir epic/feature'ın bağımlılığının
 * "bitti" sayılması o düğümün KENDİ `status` alanına bakarak YAPILAMAZ — hiçbir
 * mekanizma bir epic/feature'ın `status`'unu otomatik `done`'a çevirmiyor (sadece
 * task'lar işaretlenir). Bu yüzden epic/feature bağımlılıkları `computeEpicDone`/
 * `computeFeatureDone`'a (altındaki TÜM task'lar done mu) devredilir — `status`'a
 * bakmak, ikinci bir feature/epic'in bağımlılığı bittiği halde sonsuza dek
 * "hazır değil" sayılmasına (graph'ın tıkanmasına) yol açıyordu.
 */
function isDependencyDone(graph, dep) {
    if (dep.kind === "epic")
        return computeEpicDone(graph, dep.id).done;
    if (dep.kind === "feature")
        return computeFeatureDone(graph, dep.id).done;
    return dep.frontmatter.status === "done";
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
export function findExpandCandidates(graph) {
    const candidates = [];
    for (const node of graph.nodesById.values()) {
        if (node.kind !== "epic" && node.kind !== "feature")
            continue;
        if (node.frontmatter.expanded !== false)
            continue;
        const deps = getDependsOn(graph, node.id);
        const allDepsDone = deps.every((d) => isDependencyDone(graph, d));
        if (allDepsDone)
            candidates.push({ id: node.id, kind: node.kind });
    }
    candidates.sort((a, b) => a.kind === b.kind ? a.id.localeCompare(b.id) : a.kind === "feature" ? -1 : 1);
    return candidates;
}
