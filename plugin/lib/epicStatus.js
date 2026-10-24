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
 */
export function computeEpicDone(graph, epicId) {
    const tasks = [...graph.nodesById.values()].filter((n) => n.epicId === epicId && n.kind === "task");
    const doneCount = tasks.filter((n) => n.frontmatter.status === "done").length;
    return {
        epicId,
        done: tasks.length > 0 && doneCount === tasks.length,
        total: tasks.length,
        doneCount,
    };
}
