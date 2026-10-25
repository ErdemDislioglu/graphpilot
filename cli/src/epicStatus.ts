import { getChildren } from "./graph/types.js";
import type { Graph } from "./graph/types.js";

export interface EpicDoneResult {
  epicId: string;
  /** Epic altındaki TÜM task'lar `status: done` ise `true`. */
  done: boolean;
  total: number;
  doneCount: number;
}

/**
 * Faz 7.2 — "Repo-map her epic sonunda yeniden üretilir". Orkestratör (`/gp:run`), bir
 * task'ı `done` işaretledikten sonra bunu çağırır: epic'in TÜM task'ları bitmişse
 * `gp repomap`'i yeniden çalıştırır (kod gerçekten değişti, harita bayatlamasın).
 * Epic kendisi hiç task'ı yoksa `done:false` döner (henüz genişletilmemiş epic
 * "bitti" sayılmaz).
 *
 * ❗ Faz 8 pilot koşusunda bulunan gerçek bug — **sadece task'lar** sayılır, feature'lar
 * DEĞİL: hiçbir mekanizma bir feature'ın `status`'unu otomatik `done`'a çevirmiyor (sadece
 * task'lar `gp set ... status=done` ile elle/orkestratör tarafından işaretlenir) — feature'ları
 * da sayan ilk sürüm, epic'in tüm task'ları bitse de hep `done:false` döndürüyordu
 * (`indexGen.ts`'in `formatProgress`'u da zaten aynı sebeple sadece `tasksOf` kullanıyordu —
 * tutarlı hale getirildi).
 *
 * Faz 14 B3 — sadece VAR OLAN task'ları saymak yetmez: E02-F02 henüz genişletilmemişken
 * (`expanded: false`, hiç task'ı yok) E02'nin mevcut task'ları bitince `done:true` dönüyordu
 * → repo-map erken tazeleniyordu. Epic'in kendisi ya da altındaki herhangi bir feature
 * genişletilmemişse epic bitmiş sayılmaz.
 */
export function computeEpicDone(graph: Graph, epicId: string): EpicDoneResult {
  const tasks = [...graph.nodesById.values()].filter(
    (n) => n.epicId === epicId && n.kind === "task",
  );
  const doneCount = tasks.filter((n) => n.frontmatter.status === "done").length;
  const epic = graph.nodesById.get(epicId);
  const hasUnexpanded =
    epic?.frontmatter.expanded === false ||
    getChildren(graph, epicId).some(
      (n) => n.kind === "feature" && n.frontmatter.expanded === false,
    );
  return {
    epicId,
    done: !hasUnexpanded && tasks.length > 0 && doneCount === tasks.length,
    total: tasks.length,
    doneCount,
  };
}

export interface FeatureDoneResult {
  featureId: string;
  /** Feature'ın DOĞRUDAN çocuğu olan tüm task'lar `status: done` ise `true`. */
  done: boolean;
  total: number;
  doneCount: number;
}

/**
 * 2026-10-25 — gerçek bir test projesinde bulunan bug (`gp expand-candidates`): bir
 * feature'ın başka bir feature'a `depends_on` ile bağlı olması durumunda, bağımlılığın
 * "bitti" sayılması için o feature'ın KENDİ `status` alanının `done` olması
 * bekleniyordu — ama HİÇBİR mekanizma bir feature'ın `status`'unu otomatik `done`'a
 * çevirmiyor (sadece task'lar `gp set ... status=done` ile işaretlenir, `computeEpicDone`'ın
 * KENDİ yorumunun da söylediği gibi). Sonuç: ikinci feature sonsuza dek "hazır değil"
 * sayılıyor, graph tıkanıyor. `computeEpicDone`'la AYNI çözüm: feature'ın KENDİ
 * `status`'una değil, DOĞRUDAN çocuğu olan task'ların (parent_of kenarı) hepsinin
 * `done` olup olmadığına bakılır.
 */
export function computeFeatureDone(graph: Graph, featureId: string): FeatureDoneResult {
  const tasks = getChildren(graph, featureId).filter((n) => n.kind === "task");
  const doneCount = tasks.filter((n) => n.frontmatter.status === "done").length;
  return {
    featureId,
    done: tasks.length > 0 && doneCount === tasks.length,
    total: tasks.length,
    doneCount,
  };
}
