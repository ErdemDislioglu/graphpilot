import { computeNext } from "./next.js";
import { tasksOf } from "./graph/types.js";
/**
 * Roadmap 9.5 — "Hiç `ready` düğüm yok ama bitmemiş düğüm var (deadlock) → raporla".
 * `running` bir düğüm varsa deadlock SAYILMAZ (henüz ilerleme sürüyor, biri bitince
 * `blocked` olanlar açılabilir). `blockerStatus: "failed"` olan satırlar en olası KÖK
 * SEBEP — `depends_on` zinciri permanent bir başarısızlığa çıkıyor, elle müdahale gerekir
 * (döngü ihtimali zaten `gp validate`'in kendi kontrolünde ayrı raporlanıyor).
 */
export function computeDeadlockReport(graph) {
    const next = computeNext(graph);
    const hasRunning = tasksOf(graph).some((t) => t.frontmatter.status === "running");
    if (next.ready.length > 0 || hasRunning || next.blocked.length === 0) {
        return { isDeadlocked: false, reasons: [] };
    }
    const reasons = next.blocked.flatMap((b) => b.waitingOn.map((w) => ({
        nodeId: b.node.id,
        blockedBy: w.id,
        blockerStatus: String(w.frontmatter.status ?? "bilinmiyor"),
    })));
    return { isDeadlocked: true, reasons };
}
