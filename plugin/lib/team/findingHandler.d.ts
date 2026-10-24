import { type Lang } from "../autopilot/messages.js";
import { type Situation } from "./managerPolicy.js";
import type { Finding } from "./finding.js";
import type { Notifier } from "../autopilot/notifier.js";
import { type Graph, type GraphNode } from "../graph/types.js";
import type { Config } from "../schema/index.js";
export interface FindingImpact {
    blockedTaskIds: string[];
    independentCount: number;
}
/** Roadmap 13.9'un "Etki" satırı için deterministik sayım (bkz. `messages.ts`'in
 * `formatImpactText`'i — burası sadece GRAPH'A bakan kısım, biçimleme ayrı). */
export declare function computeFindingImpact(graph: Graph, nodeId: string): FindingImpact;
/** `Finding.kind` → 13.8'in karar tablosu `Situation`'ı. Roadmap'in `ambiguity`/
 * `tech_debt`'i AÇIKÇA bloklayan kategoriler olarak LİSTELEMİYOR (coder.md/senior.md'nin
 * kendi talimatı: "bloklayan SADECE güvenlik, veri kaybı, brief/kapsam çelişkisi ve
 * mimari değişiklik") — pratikte bu ikisi bloklayan gelmemeli, ama GELİRSE güvenli
 * varsayılan `scope_conflict` (ask_user'a çıkar, autonomy izin vermedikçe tahmin etmez). */
export declare const FINDING_KIND_TO_SITUATION: Record<Finding["kind"], Situation>;
export type FindingOutcome = {
    kind: "proceeded_with_recommended";
    nodeId: string;
    chosenOptionIndex: number;
} | {
    kind: "self_resolved";
    nodeId: string;
    chosenOptionIndex: number;
} | {
    kind: "needs_senior_consultation";
    nodeId: string;
    situation: Situation;
} | {
    kind: "stopped";
    nodeId: string;
} | {
    kind: "user_chose";
    nodeId: string;
    chosenOptionIndex: number;
};
/**
 * Roadmap 13.7 — ilk/mekanik kapı: `severity` bloklayan mı değil mi. Bloklamıyorsa
 * ekip üyesi zaten önerilen seçenekle devam etmiş SAYILIR (gerçek "devam etme" eylemi
 * agent'ın kendi işi — burası sadece KAYDEDER). Bloklayan ise düğümü `needs_decision`
 * yapar ve 13.8'in politika tablosuna göre dallanır: `self` burada biter, `ask_user`
 * burada Telegram'dan sorulup biter, `consult_senior` ise GERÇEK bir Agent tool çağrısı
 * gerektirir (bu fonksiyonun kapsamı DIŞINDA — çağıran taraf senior'ı çağırıp cevabıyla
 * `resolveAfterSeniorConsultation`'ı çağırmalı).
 */
export declare function handleFinding(opts: {
    graph: Graph;
    graphRootDir: string;
    config: Config;
    notifier: Notifier;
    lang: Lang;
    node: GraphNode;
    finding: Finding;
}): Promise<FindingOutcome>;
/** `consult_senior` dalının TAMAMLANMASI — çağıran taraf GERÇEK senior danışmasını
 * (Agent tool) yapıp sonucu `seniorGaveConfidentRecommendation`'a çevirdikten sonra çağırır. */
export declare function resolveAfterSeniorConsultation(opts: {
    graph: Graph;
    graphRootDir: string;
    notifier: Notifier;
    lang: Lang;
    node: GraphNode;
    finding: Finding;
    seniorGaveConfidentRecommendation: boolean;
}): Promise<FindingOutcome>;
