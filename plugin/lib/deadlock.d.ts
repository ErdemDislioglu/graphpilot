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
export declare function computeDeadlockReport(graph: Graph): DeadlockReport;
