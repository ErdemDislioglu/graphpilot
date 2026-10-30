import { type Lang } from "./messages.js";
import type { Notifier } from "./notifier.js";
import type { Config } from "../schema/index.js";
import { type Graph, type GraphNode } from "../graph/types.js";
import type { AgentQuestion } from "../runModeB.js";
export type ApprovalDecision = "retry" | "escalate" | "skip" | "stop" | "approve";
export type ApprovalKind = "failure" | "risk";
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
export declare function needsApproval(node: GraphNode, config: Config, graph: Graph): boolean;
/**
 * Roadmap 12.6 düzeltmesi — risk onayı YALNIZ gerçekten sıradaki görev için: `pending`,
 * tüm bağımlılıkları `done` (yani `computeNext`'in "ready" tanımı) ve daha önce
 * onaylanmamış (`approved: true` yok). Eskiden her turda done olanlar dahil tüm
 * `risk: high` görevler soruluyordu; "retry" bitmiş görevi baştan çalıştırıyordu.
 */
export declare function needsRiskApproval(node: GraphNode, config: Config, graph: Graph): boolean;
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
    /** Varsayılan "failure" (12.6'nın başarısızlık onayı). "risk": `risk: high` başlatma onayı. */
    kind?: ApprovalKind;
    sleep?: (ms: number) => Promise<void>;
    /** Bekleme sırasında Telegram güncellemelerini işlemek için (`poller.pollOnce`). */
    poll?: () => Promise<void>;
    pollIntervalMs?: number;
}): Promise<ApprovalOutcome>;
/**
 * Faz 12 — agent `blocked:` döndü (exit 0 olsa da). Escalation'a SOKULMAZ (model
 * değiştirmek bir kararı çözmez): görev `needs_decision` olur, neden `## Hata geçmişi`'ne
 * yazılır. Bağımlıları `computeNext` gereği bekler; bağımsız işler devam eder.
 */
export declare function markBlocked(graph: Graph, graphRootDir: string, node: GraphNode, reason: string, question?: AgentQuestion): void;
/**
 * `markBlocked` sonrası Telegram cevabını uygular. `opt:<i>` (mimari karar seçeneği) →
 * seçim `## Hata geçmişi`'ne "karar (kullanıcı)" olarak yazılır (görev yeniden
 * çalışınca bağlam paketinde görünür) ve epic karar günlüğüne (13.11) işlenir, görev
 * `pending`'e döner. retry → pending, skip → skipped. stop → görev `pending`'e döner
 * (otopilot yeniden başlatılınca tekrar denenir/sorulur), çağıran taraf döngüyü durdurur.
 */
export declare function applyBlockedAnswer(graph: Graph, graphRootDir: string, node: GraphNode, answer: string, question?: AgentQuestion, decidedBy?: "kullanıcı" | "otomatik"): ApprovalDecision;
/**
 * Kullanıcı isteği (2026-10-30) — Telegram'dan yalnız `risk: high` görevler sorulur.
 * Diğerlerinde `blocked` kararı otomatik: agent'ın `(önerilen)` seçeneği (işaret yoksa
 * ilki) seçilip görev yeniden çalışır; soru yoksa görev atlanır (bağımlıları bekler).
 * `failed` görevlerin onay akışı bundan etkilenmez.
 */
export declare function autoBlockedAnswer(question?: AgentQuestion): string;
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
