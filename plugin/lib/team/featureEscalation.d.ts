import type { Graph } from "../graph/types.js";
/**
 * Roadmap 13.5 — "Yönetici, ardışık 2 görevde aynı tür başarısızlık görürse aynı
 * feature'ın kalan görevlerini önleyici olarak senior'a atayabilir (dengeli yetki
 * kapsamında, kaydedilir)." "Aynı tür başarısızlık" deterministik karşılığı: bu
 * feature için kaydedilen SON İKİ mis-tag olayı ikisi de `underestimated` (junior'ın
 * yetersiz kaldığı) ise true — `tagging.jsonl`'in kendi zaman sırası kullanılır.
 */
export declare function shouldPreemptivelyEscalateFeature(graphRootDir: string, featureId: string): boolean;
export interface PreemptiveEscalationResult {
    triggered: boolean;
    assignedNodeIds: string[];
}
/** Feature'ın `pending` (henüz elle/otomatik atanmamış) görevlerini `assignee: senior`
 * yapar — `escalateTeamNode`'un AKSİNE burada mis_tag kaydı YAPILMAZ (bu önleyici bir
 * eylem, gerçek bir başarısızlık değil; kayıt zaten TETİKLEYEN iki olaydan geldi). */
export declare function preemptivelyAssignRemainingToSenior(graph: Graph, featureId: string): PreemptiveEscalationResult;
/** İki adımı birleştiren kullanım-kolaylığı sarmalayıcı — koşul karşılanmazsa dokunmaz. */
export declare function maybePreemptivelyEscalateFeature(graph: Graph, graphRootDir: string, featureId: string): PreemptiveEscalationResult;
