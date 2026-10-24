import { extractSection } from "./markdown.js";
import type { GraphNode } from "./graph/types.js";

export interface RecoveryDecision {
  nodeId: string;
  action: "resume" | "revert";
  reason: string;
}

/**
 * Roadmap 9.1 — bir önceki oturumdan `status: running` kalmış bir düğüm için karar:
 * agent `## Yarım iş` notu yazmışsa (gerçek içerikli, placeholder değil) → **devam**
 * (kaldığı yerden, context paketi + Yarım iş notu ile); yazmamışsa → **geri al**
 * (commit'lenmemiş değişiklik atılır, düğüm `pending`'e döner — SPEC/roadmap 6.6'nın
 * "park yerine geri alma" kararıyla aynı basitlik ilkesi).
 */
export function decideRunningNodeRecovery(node: GraphNode): RecoveryDecision {
  const wip = extractSection(node.body, "Yarım iş");
  const hasRealWip = wip !== null && wip.trim() !== "" && !wip.trim().startsWith("*(");
  if (hasRealWip) {
    return {
      nodeId: node.id,
      action: "resume",
      reason: "## Yarım iş notu var — kaldığı yerden devam edecek",
    };
  }
  return {
    nodeId: node.id,
    action: "revert",
    reason: "## Yarım iş notu yok — commit'lenmemiş değişiklik (varsa) geri alınıp pending'e dönecek",
  };
}

const WIP_COMMIT_RE = /^gp-wip\(([^)]+)\):/;

/**
 * Roadmap 9.1 — `gp recover`'ın "yetim WIP commit" tespiti. `commitSubjects` `git log
 * --format=%s` çıktısının satırları (saf fonksiyon — gerçek git'e bağlı değil, test edilebilir).
 * `resumingNodeIds`: bu koşuda "resume" kararı verilen (yani WIP commit'leri MEŞRU kalan)
 * düğüm ID'leri. Bunların DIŞINDAKİ her `gp-wip(<id>):` commit'i — ya düğüm az önce geri
 * alındı, ya da çok daha önce bitmiş ama WIP commit'leri hiç squash edilmemiş — "yetim" sayılır.
 */
export function findOrphanWipCommits(
  commitSubjects: string[],
  resumingNodeIds: ReadonlySet<string>,
): string[] {
  const orphans: string[] = [];
  for (const subject of commitSubjects) {
    const m = subject.match(WIP_COMMIT_RE);
    if (m && !resumingNodeIds.has(m[1])) orphans.push(subject);
  }
  return orphans;
}
