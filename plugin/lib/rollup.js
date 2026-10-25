import { readFileSync } from "node:fs";
import { writeFileAtomic } from "./atomicWrite.js";
import { computeEpicDone, computeFeatureDone } from "./epicStatus.js";
import { patchFrontmatterLines } from "./set.js";
/**
 * Roll-up'ın yönettiği durumlar. `failed`/`blocked`/`skipped`/`needs_decision` bir insan
 * ya da hata politikası kararıdır — task'lardan türetilmez, dokunulmaz.
 */
const MANAGED = new Set(["pending", "ready", "running", "done"]);
/**
 * Faz 14 B2 — feature/epic `status`'unu task'lardan türetir. Eskiden hiçbir mekanizma
 * epic/feature'ı `done`'a çekmiyordu: 18 task'ın hepsi bitince `gp status` hâlâ 9 `pending`
 * gösteriyordu. "Bitti" tanımı `computeFeatureDone`/`computeEpicDone` ile aynıdır (B3:
 * genişletilmemiş çocuk varken epic bitmez). Bitmiş sayılmayan ama `done` yazan düğüm
 * (ör. sonradan yeni task eklendi) `pending`'e döner. Deterministik: ID sırasıyla.
 */
export function computeRollup(graph) {
    const changes = [];
    const parents = [...graph.nodesById.values()]
        .filter((n) => n.kind === "feature" || n.kind === "epic")
        .sort((a, b) => a.id.localeCompare(b.id));
    for (const node of parents) {
        const current = node.frontmatter.status;
        if (typeof current !== "string" || !MANAGED.has(current))
            continue;
        const done = node.kind === "epic"
            ? computeEpicDone(graph, node.id).done
            : computeFeatureDone(graph, node.id).done;
        if (done && current !== "done")
            changes.push({ id: node.id, from: current, to: "done" });
        else if (!done && current === "done")
            changes.push({ id: node.id, from: current, to: "pending" });
    }
    return changes;
}
/** `computeRollup`'ın değişikliklerini diske yazar ve döndürür. */
export function applyRollup(graph) {
    const changes = computeRollup(graph);
    for (const change of changes) {
        const { filePath } = graph.nodesById.get(change.id);
        // Yalnız `status:` satırı değişir (B7d'nin biçimi koruyan yazıcısı) — roll-up her task
        // bitişinde çalıştığı için epic/feature dosyalarında diff gürültüsü üretmez.
        writeFileAtomic(filePath, patchFrontmatterLines(readFileSync(filePath, "utf-8"), { status: change.to }));
    }
    return changes;
}
