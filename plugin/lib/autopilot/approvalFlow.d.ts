import { type Lang } from "./messages.js";
import type { Notifier } from "./notifier.js";
import type { Config } from "../schema/index.js";
import type { Graph, GraphNode } from "../graph/types.js";
export type ApprovalDecision = "retry" | "escalate" | "skip" | "stop";
export interface ApprovalOutcome {
    nodeId: string;
    decision: ApprovalDecision;
    timedOut: boolean;
}
/**
 * Roadmap 12.6 — "risk: high düğüm (config ile opsiyonel)". `failed` durumu BURADA
 * tekrar KONTROL EDİLMEZ: `failNode` (fail.ts) zaten sadece doğrulama döngüsü + escalation
 * zinciri tükendiğinde çağrılıyor (SPEC/roadmap 6.5) — bir düğümün `status === "failed"`
 * olması kendi başına "doğrulama döngüsü ve yükseltme sonrası" koşulunu karşılar.
 */
export declare function needsApproval(node: GraphNode, config: Config): boolean;
/**
 * Roadmap 12.6 — tam onay akışı: düğümü `needs_decision` yapar (bu sırada SADECE ona
 * bağımlı düğümler bekler — `computeNext`/`next.ts` zaten "done değilse bağımlı bekler"
 * mantığıyla bunu otomatik sağlar, ayrı bir kod değişikliği gerekmez), Telegram'dan
 * butonlu soru sorar, `timeout_minutes` içinde cevap gelmezse `timeout_action`
 * uygulanır. Her karar `events.jsonl`'e ve düğümün `## Hata geçmişi`'ne yazılır.
 */
export declare function requestApproval(opts: {
    graph: Graph;
    graphRootDir: string;
    config: Config;
    notifier: Notifier;
    lang: Lang;
    node: GraphNode;
    attempts: number;
    lastError: string;
    sleep?: (ms: number) => Promise<void>;
}): Promise<ApprovalOutcome>;
/**
 * Roadmap 12.6 — deadlock için düzeltici tek bir "doğru" eylem yok (hangi düğümü
 * tekrar/atla/durdur seçilecek belirsiz — kökteki düğüm genelde zaten kendi `failed`
 * onayından geçmiş olur). Bu yüzden deadlock butonlu bir `ask()` DEĞİL, bir bilgi
 * mesajıdır — kullanıcı `gp set`/Telegram `/stop` ile elle müdahale eder.
 */
export declare function notifyDeadlock(opts: {
    graphRootDir: string;
    notifier: Notifier;
    lang: Lang;
    reasons: {
        nodeId: string;
        blockedBy: string;
        blockerStatus: string;
    }[];
}): Promise<void>;
/** Roadmap 12.5/12.7 — limit bildirimi için `limitMessage` şablonunu gönderir. */
export declare function notifyLimit(opts: {
    graphRootDir: string;
    notifier: Notifier;
    lang: Lang;
    resetHint?: string;
    doneCount: number;
    totalCount: number;
}): Promise<void>;
