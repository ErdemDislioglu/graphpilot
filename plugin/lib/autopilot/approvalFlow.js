import { setFrontmatter } from "../set.js";
import { appendErrorHistoryLine } from "../errorHistory.js";
import { escalateNode } from "../escalate.js";
import { emitEvent } from "./eventBus.js";
import { recordDecision } from "../team/decisionLog.js";
import { OPTION_VALUE_PREFIX, failureApprovalMessage, limitMessage, riskApprovalMessage, } from "./messages.js";
import { getDependsOn } from "../graph/types.js";
/**
 * Roadmap 12.6 — "risk: high düğüm (config ile opsiyonel)". `failed` durumu BURADA
 * tekrar KONTROL EDİLMEZ: `failNode` (fail.ts) zaten sadece doğrulama döngüsü + escalation
 * zinciri tükendiğinde çağrılıyor (SPEC/roadmap 6.5) — bir düğümün `status === "failed"`
 * olması kendi başına "doğrulama döngüsü ve yükseltme sonrası" koşulunu karşılar.
 */
export function needsApproval(node, config, graph) {
    if (node.frontmatter.status === "failed")
        return true;
    return needsRiskApproval(node, config, graph);
}
/**
 * Roadmap 12.6 düzeltmesi — risk onayı YALNIZ gerçekten sıradaki görev için: `pending`,
 * tüm bağımlılıkları `done` (yani `computeNext`'in "ready" tanımı) ve daha önce
 * onaylanmamış (`approved: true` yok). Eskiden her turda done olanlar dahil tüm
 * `risk: high` görevler soruluyordu; "retry" bitmiş görevi baştan çalıştırıyordu.
 */
export function needsRiskApproval(node, config, graph) {
    if (!config.autopilot.approvals.on_risk_high)
        return false;
    if (node.frontmatter.risk !== "high" || node.frontmatter.approved === true)
        return false;
    if (node.frontmatter.status !== "pending")
        return false;
    return getDependsOn(graph, node.id).every((d) => d.frontmatter.status === "done");
}
const TIMEOUT_SENTINEL = Symbol("autopilot-approval-timeout");
const timeoutAfter = (sleep, ms) => sleep(ms).then(() => TIMEOUT_SENTINEL);
async function sleepMs(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
/**
 * `ask()`'ın cevabı ancak biri `poller.pollOnce()` çağırınca gelir (telegramNotifier.ts) —
 * onay beklerken ana döngü durduğu için `poll` verilirse bekleme parçalara bölünür ve her
 * parça arasında poll edilir. Verilmezse (testler) tek parça bekleme — eski davranış.
 */
async function waitForAnswer(askPromise, timeoutMs, sleep, poll, chunkMs = 15_000) {
    if (!poll)
        return Promise.race([askPromise, timeoutAfter(sleep, timeoutMs)]);
    let remaining = timeoutMs;
    while (remaining > 0) {
        const step = Math.min(chunkMs, remaining);
        const result = await Promise.race([askPromise, timeoutAfter(sleep, step)]);
        if (result !== TIMEOUT_SENTINEL)
            return result;
        remaining -= step;
        await poll();
    }
    return TIMEOUT_SENTINEL;
}
/**
 * Roadmap 12.6 — tam onay akışı: düğümü `needs_decision` yapar (bu sırada SADECE ona
 * bağımlı düğümler bekler — `computeNext`/`next.ts` zaten "done değilse bağımlı bekler"
 * mantığıyla bunu otomatik sağlar, ayrı bir kod değişikliği gerekmez), Telegram'dan
 * butonlu soru sorar, `timeout_minutes` içinde cevap gelmezse `timeout_action`
 * uygulanır. Her karar `events.jsonl`'e ve düğümün `## Hata geçmişi`'ne yazılır.
 */
export async function requestApproval(opts) {
    const { graph, graphRootDir, config, notifier, lang, node } = opts;
    const sleep = opts.sleep ?? sleepMs;
    const kind = opts.kind ?? "failure";
    // Risk onayında görev `pending` kalır: bekleme sırasında süreç düşerse ya da zaman
    // aşımı "stop" ise görev kaybolmaz, sonraki başlatmada yeniden sorulur.
    if (kind === "failure")
        setFrontmatter(graph, node.id, { status: "needs_decision" });
    emitEvent(graphRootDir, {
        type: "needs_decision",
        nodeId: node.id,
        message: kind === "risk" ? "risk: high" : opts.lastError,
    });
    const msg = kind === "risk"
        ? riskApprovalMessage(lang, { nodeId: node.id, nodeTitle: node.name })
        : failureApprovalMessage(lang, {
            nodeId: node.id,
            nodeTitle: node.name,
            attempts: opts.attempts,
            lastError: opts.lastError,
        });
    const timeoutMs = config.autopilot.approvals.timeout_minutes * 60_000;
    const askPromise = notifier.ask(msg.text, msg.buttons ?? []);
    const result = await waitForAnswer(askPromise, timeoutMs, sleep, opts.poll, opts.pollIntervalMs);
    const timedOut = result === TIMEOUT_SENTINEL;
    const decision = timedOut
        ? config.autopilot.approvals.timeout_action
        : result;
    if (kind === "risk")
        applyRiskDecision(graph, node, decision);
    else
        applyDecision(graph, node, config, decision);
    emitEvent(graphRootDir, {
        type: "decision_answered",
        nodeId: node.id,
        data: { decision, timedOut },
    });
    appendErrorHistoryLine(node.filePath, `${node.id} karar: ${decision}${timedOut ? " (zaman aşımı — otomatik)" : ""}`);
    if (timedOut) {
        await notifier.send(lang === "tr"
            ? `⏱ ${node.id} için zaman aşımı — otomatik karar: ${decision}.`
            : `⏱ Timeout for ${node.id} — automatic decision: ${decision}.`);
    }
    return { nodeId: node.id, decision, timedOut };
}
function applyDecision(graph, node, config, decision) {
    switch (decision) {
        case "retry":
            setFrontmatter(graph, node.id, { status: "pending" });
            break;
        case "escalate":
            escalateNode(graph, node.id, config);
            setFrontmatter(graph, node.id, { status: "pending" });
            break;
        case "skip":
            setFrontmatter(graph, node.id, { status: "skipped" });
            break;
        case "stop":
            setFrontmatter(graph, node.id, { status: "failed" });
            break;
        case "approve":
            break; // yalnız risk onayında anlamlı (applyRiskDecision)
    }
}
/** Risk onayı: approve → `approved: true` (pending kalır, döngü çalıştırır); stop görevi
 * `failed` YAPMAZ — yalnız otopilot durur, görev sonra kaldığı yerden sorulur. */
function applyRiskDecision(graph, node, decision) {
    if (decision === "approve")
        setFrontmatter(graph, node.id, { approved: "true" });
    else if (decision === "skip")
        setFrontmatter(graph, node.id, { status: "skipped" });
}
/**
 * Faz 12 — agent `blocked:` döndü (exit 0 olsa da). Escalation'a SOKULMAZ (model
 * değiştirmek bir kararı çözmez): görev `needs_decision` olur, neden `## Hata geçmişi`'ne
 * yazılır. Bağımlıları `computeNext` gereği bekler; bağımsız işler devam eder.
 */
export function markBlocked(graph, graphRootDir, node, reason, question) {
    setFrontmatter(graph, node.id, { status: "needs_decision" });
    appendErrorHistoryLine(node.filePath, `${node.id} blocked: ${reason}${question ? ` — soru: ${question.text}` : ""}`);
    emitEvent(graphRootDir, { type: "needs_decision", nodeId: node.id, message: reason, data: { blocked: true, question } });
}
/**
 * `markBlocked` sonrası Telegram cevabını uygular. `opt:<i>` (mimari karar seçeneği) →
 * seçim `## Hata geçmişi`'ne "karar (kullanıcı)" olarak yazılır (görev yeniden
 * çalışınca bağlam paketinde görünür) ve epic karar günlüğüne (13.11) işlenir, görev
 * `pending`'e döner. retry → pending, skip → skipped. stop → görev `pending`'e döner
 * (otopilot yeniden başlatılınca tekrar denenir/sorulur), çağıran taraf döngüyü durdurur.
 */
export function applyBlockedAnswer(graph, graphRootDir, node, answer, question) {
    let decision;
    let line;
    if (answer.startsWith(OPTION_VALUE_PREFIX) && question) {
        const chosen = question.options[Number(answer.slice(OPTION_VALUE_PREFIX.length))] ?? answer;
        decision = "retry";
        line = `${node.id} karar (kullanıcı): ${question.text} → ${chosen}`;
        // Epic düğümü graph'ta yoksa (ör. elle oluşturulmuş tek görev) günlük düğümü açılamaz.
        if (node.epicId && graph.nodesById.get(node.epicId)?.kind === "epic") {
            recordDecision(graph, {
                epicId: node.epicId,
                nodeId: node.id,
                summary: `${question.text} → ${chosen}`,
                decidedBy: "user (Telegram)",
                optionsCount: question.options.length,
            });
        }
    }
    else {
        decision = answer === "skip" || answer === "stop" ? answer : "retry";
        line = `${node.id} karar: ${decision}`;
    }
    setFrontmatter(graph, node.id, { status: decision === "skip" ? "skipped" : "pending" });
    appendErrorHistoryLine(node.filePath, line);
    emitEvent(graphRootDir, { type: "decision_answered", nodeId: node.id, data: { decision, blocked: true } });
    return decision;
}
/**
 * Roadmap 12.6 — deadlock için düzeltici tek bir "doğru" eylem yok (hangi düğümü
 * tekrar/atla/durdur seçilecek belirsiz — kökteki düğüm genelde zaten kendi `failed`
 * onayından geçmiş olur). Bu yüzden deadlock butonlu bir `ask()` DEĞİL, bir bilgi
 * mesajıdır — kullanıcı `gp set`/Telegram `/stop` ile elle müdahale eder.
 */
export async function notifyDeadlock(opts) {
    const { graphRootDir, notifier, lang, reasons } = opts;
    emitEvent(graphRootDir, { type: "failure", message: "deadlock", data: { reasons } });
    const list = reasons.map((r) => `${r.nodeId} ⇐ ${r.blockedBy} (${r.blockerStatus})`).join(", ");
    await notifier.send(lang === "tr"
        ? `🛑 Deadlock: hiçbir düğüm ilerleyemiyor. ${list}. Elle müdahale gerekiyor (gp set / /stop).`
        : `🛑 Deadlock: no node can progress. ${list}. Manual intervention needed (gp set / /stop).`);
}
/** Roadmap 12.5/12.7 — limit bildirimi için `limitMessage` şablonunu gönderir. */
export async function notifyLimit(opts) {
    const { graphRootDir, notifier, lang, ...counts } = opts;
    emitEvent(graphRootDir, { type: "limit_hit", data: counts });
    const msg = limitMessage(lang, counts);
    await notifier.send(msg.text);
}
