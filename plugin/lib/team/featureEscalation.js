import { setFrontmatter } from "../set.js";
import { readMisTagRecords } from "./tagging.js";
/**
 * Roadmap 13.5 — "Yönetici, ardışık 2 görevde aynı tür başarısızlık görürse aynı
 * feature'ın kalan görevlerini önleyici olarak senior'a atayabilir (dengeli yetki
 * kapsamında, kaydedilir)." "Aynı tür başarısızlık" deterministik karşılığı: bu
 * feature için kaydedilen SON İKİ mis-tag olayı ikisi de `underestimated` (junior'ın
 * yetersiz kaldığı) ise true — `tagging.jsonl`'in kendi zaman sırası kullanılır.
 */
export function shouldPreemptivelyEscalateFeature(graphRootDir, featureId) {
    const records = readMisTagRecords(graphRootDir).filter((r) => r.nodeId.startsWith(`${featureId}-`));
    const lastTwo = records.slice(-2);
    return lastTwo.length === 2 && lastTwo.every((r) => r.direction === "underestimated");
}
/** Feature'ın `pending` (henüz elle/otomatik atanmamış) görevlerini `assignee: senior`
 * yapar — `escalateTeamNode`'un AKSİNE burada mis_tag kaydı YAPILMAZ (bu önleyici bir
 * eylem, gerçek bir başarısızlık değil; kayıt zaten TETİKLEYEN iki olaydan geldi). */
export function preemptivelyAssignRemainingToSenior(graph, featureId) {
    const assignedNodeIds = [];
    for (const node of graph.nodesById.values()) {
        if (node.kind !== "task")
            continue;
        if (!node.id.startsWith(`${featureId}-`))
            continue;
        if (node.frontmatter.status !== "pending")
            continue;
        if (node.frontmatter.assignee === "senior")
            continue;
        const result = setFrontmatter(graph, node.id, { assignee: "senior" });
        if (result.ok)
            assignedNodeIds.push(node.id);
    }
    return { triggered: assignedNodeIds.length > 0, assignedNodeIds };
}
/** İki adımı birleştiren kullanım-kolaylığı sarmalayıcı — koşul karşılanmazsa dokunmaz. */
export function maybePreemptivelyEscalateFeature(graph, graphRootDir, featureId) {
    if (!shouldPreemptivelyEscalateFeature(graphRootDir, featureId)) {
        return { triggered: false, assignedNodeIds: [] };
    }
    return preemptivelyAssignRemainingToSenior(graph, featureId);
}
