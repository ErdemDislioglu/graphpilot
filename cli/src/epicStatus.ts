import type { Graph } from "./graph/types.js";

export interface EpicDoneResult {
  epicId: string;
  /** Epic altındaki TÜM feature/task'lar `status: done` ise `true`. */
  done: boolean;
  total: number;
  doneCount: number;
}

/**
 * Faz 7.2 — "Repo-map her epic sonunda yeniden üretilir". Orkestratör (`/gp:run`), bir
 * task'ı `done` işaretledikten sonra bunu çağırır: epic'in TÜM feature/task'ları
 * bitmişse `gp repomap`'i yeniden çalıştırır (kod gerçekten değişti, harita bayatlamasın).
 * Epic kendisi `expanded:false` ya da hiç feature/task'ı yoksa `done:false` döner (henüz
 * genişletilmemiş epic "bitti" sayılmaz).
 */
export function computeEpicDone(graph: Graph, epicId: string): EpicDoneResult {
  const members = [...graph.nodesById.values()].filter(
    (n) => n.epicId === epicId && (n.kind === "feature" || n.kind === "task"),
  );
  const doneCount = members.filter((n) => n.frontmatter.status === "done").length;
  return {
    epicId,
    done: members.length > 0 && doneCount === members.length,
    total: members.length,
    doneCount,
  };
}
