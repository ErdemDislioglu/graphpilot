import { readFileSync } from "node:fs";
import { writeFileAtomic } from "./atomicWrite.js";
import { computeEpicDone, computeFeatureDone } from "./epicStatus.js";
import type { Graph } from "./graph/types.js";

export interface StatusChange {
  id: string;
  from: string;
  to: string;
}

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
export function computeRollup(graph: Graph): StatusChange[] {
  const changes: StatusChange[] = [];
  const parents = [...graph.nodesById.values()]
    .filter((n) => n.kind === "feature" || n.kind === "epic")
    .sort((a, b) => a.id.localeCompare(b.id));
  for (const node of parents) {
    const current = node.frontmatter.status;
    if (typeof current !== "string" || !MANAGED.has(current)) continue;
    const done =
      node.kind === "epic"
        ? computeEpicDone(graph, node.id).done
        : computeFeatureDone(graph, node.id).done;
    if (done && current !== "done") changes.push({ id: node.id, from: current, to: "done" });
    else if (!done && current === "done") changes.push({ id: node.id, from: current, to: "pending" });
  }
  return changes;
}

/** `computeRollup`'ın değişikliklerini diske yazar ve döndürür. */
export function applyRollup(graph: Graph): StatusChange[] {
  const changes = computeRollup(graph);
  for (const change of changes) {
    writeStatusLine(graph.nodesById.get(change.id)!.filePath, change.to);
  }
  return changes;
}

/**
 * Frontmatter'daki yalnız `status:` satırını değiştirir. `setFrontmatter` tüm frontmatter'ı
 * yeniden biçimlendiriyor (B7d) — otomatik roll-up her task bitişinde çalıştığı için
 * epic/feature dosyalarında diff gürültüsü üretmesin diye geri kalan satırlara dokunulmaz.
 */
function writeStatusLine(filePath: string, status: string): void {
  const raw = readFileSync(filePath, "utf-8");
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw);
  const statusLine = /^status:.*$/m;
  if (!match || !statusLine.test(match[1])) {
    throw new Error(`${filePath}: frontmatter'da 'status:' satırı yok`);
  }
  const frontmatter = match[1].replace(statusLine, `status: ${status}`);
  writeFileAtomic(filePath, raw.replace(match[1], frontmatter));
}
