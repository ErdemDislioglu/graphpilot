import { computeNext } from "./next.js";
import { getDependsOn, tasksOf } from "./graph/types.js";
import type { Graph } from "./graph/types.js";

export interface DeadlockReason {
  nodeId: string;
  /** Doğrudan beklediği, kendisi de ilerleyemeyen düğüm. */
  blockedBy: string;
  blockerStatus: string;
}

export interface DeadlockReport {
  /** `ready` boş, hiçbir task `running` değil, ama bitmemiş (done/failed olmayan) task var. */
  isDeadlocked: boolean;
  reasons: DeadlockReason[];
}

/**
 * Roadmap 9.5 — "Hiç `ready` düğüm yok ama bitmemiş düğüm var (deadlock) → raporla".
 * `running` bir düğüm varsa deadlock SAYILMAZ (henüz ilerleme sürüyor, biri bitince
 * `blocked` olanlar açılabilir). `blockerStatus: "failed"` olan satırlar en olası KÖK
 * SEBEP — `depends_on` zinciri permanent bir başarısızlığa çıkıyor, elle müdahale gerekir
 * (döngü ihtimali zaten `gp validate`'in kendi kontrolünde ayrı raporlanıyor).
 */
export function computeDeadlockReport(graph: Graph): DeadlockReport {
  const next = computeNext(graph);
  const tasks = tasksOf(graph);
  const hasRunning = tasks.some((t) => t.frontmatter.status === "running");
  // `status: blocked` (failNode'un işaretlediği bağımlılar) `computeNext`'in `blocked`'ında
  // yok (o yalnız `pending`'e bakar) — onlar da bitmemiş, ilerleyemeyen iştir.
  const markedBlocked = tasks
    .filter((t) => t.frontmatter.status === "blocked")
    .map((t) => ({ node: t, waitingOn: getDependsOn(graph, t.id).filter((d) => d.frontmatter.status !== "done") }));
  const stuck = [...next.blocked, ...markedBlocked];

  if (next.ready.length > 0 || hasRunning || stuck.length === 0) {
    return { isDeadlocked: false, reasons: [] };
  }

  const reasons: DeadlockReason[] = stuck.flatMap((b) =>
    b.waitingOn.map((w) => ({
      nodeId: b.node.id,
      blockedBy: w.id,
      blockerStatus: String(w.frontmatter.status ?? "bilinmiyor"),
    })),
  );
  return { isDeadlocked: true, reasons };
}
