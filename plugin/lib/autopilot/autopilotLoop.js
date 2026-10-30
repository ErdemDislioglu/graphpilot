import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseGraph } from "../graph/parser.js";
import { computeNext } from "../next.js";
import { computeDeadlockReport } from "../deadlock.js";
import { computeEpicDone } from "../epicStatus.js";
import { computeStatusSummary } from "../status.js";
import { resolveRoute } from "../route.js";
import { writeContextFile } from "../context.js";
import { readAgentDefinition } from "../agentFile.js";
import { runNodeHeadlessWithRetry } from "../runModeB.js";
import { failNode } from "../fail.js";
import { setFrontmatter } from "../set.js";
import { ConfigSchema } from "../schema/index.js";
import { emitEvent } from "./eventBus.js";
import { classifyLimitError } from "./limitClassifier.js";
import { planLimitWait } from "./limitWait.js";
import { needsApproval, notifyDeadlock, notifyLimit, requestApproval } from "./approvalFlow.js";
import { resolveTeamRoute } from "../team/assign.js";
import { escalateTeamNode } from "../team/teamEscalate.js";
import { epicDoneMessage, finishedMessage, resumeMessage } from "./messages.js";
import { isWithinQuietHours } from "./quietHours.js";
import { checkoutBranch, commitAll, epicBranchName, epicsListText, expandCandidateInScope, expandHeadless, helpText, inScope, parseRunTarget, pushCurrentBranch, scopeDone, } from "./epicRun.js";
/**
 * Roadmap 12.2/12.5 — `quiet_hours`: "bu saatlerde sadece kritik mesaj". Rutin ilerleme
 * bildirimleri (epic bitti, limit sonrası devam edildi) bu pencerede ERTELENMEZ, tamamen
 * ATLANIR (Telegram'ın kendi sessiz-saat ayarına güvenmek yerine — kullanıcı farklı saat
 * dilimlerinde ya da bildirimleri açık tutuyor olabilir). Onay/limit-bekleme/deadlock/
 * bitiş/durdurma mesajları KRİTİK sayılır, bu fonksiyonun ÜZERİNDEN GEÇMEZ — her zaman gider.
 */
async function sendRoutine(notifier, config, now, text) {
    const qh = config.autopilot.quiet_hours;
    if (qh && isWithinQuietHours(qh, new Date(now())))
        return;
    await notifier.send(text);
}
async function defaultSleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
function loadFresh(graphRootDir) {
    const graph = parseGraph(graphRootDir);
    const result = ConfigSchema.safeParse(graph.rawConfig);
    if (!result.success) {
        throw new Error(`config.yml geçersiz: ${result.error.issues.map((i) => i.message).join("; ")}`);
    }
    return { graph, config: result.data };
}
function countTasks(graph) {
    const tasks = [...graph.nodesById.values()].filter((n) => n.kind === "task");
    return { done: tasks.filter((n) => n.frontmatter.status === "done").length, total: tasks.length };
}
function lastErrorLine(node) {
    const match = node.body.match(/## Hata geçmişi\s*\n+([^\n]*)/);
    return match?.[1]?.trim() || "(ayrıntı yok)";
}
/** Roadmap 13.9/13.10 — `/questions` ve hatırlatma mesajı için: kararı bekleyen tüm task'lar. */
function pendingDecisionNodes(graph) {
    return [...graph.nodesById.values()].filter((n) => n.kind === "task" && n.frontmatter.status === "needs_decision");
}
const REMINDER_INTERVAL_MS = 4 * 60 * 60 * 1000; // roadmap 13.10 — "ör. 4 saatte bir"
/** `totalMs`'i `chunkMs` parçalara böler, her parça arasında `poller.pollOnce()` çağırır
 * (roadmap 12.7/12.8 — uzun bir limit beklemesi Telegram komutlarını tıkamamalı). */
async function waitWhilePolling(totalMs, chunkMs, poller, sleep, shouldStop) {
    let remaining = totalMs;
    while (remaining > 0) {
        if (shouldStop())
            return true;
        const step = Math.min(chunkMs, remaining);
        await sleep(step);
        remaining -= step;
        await poller.pollOnce(0);
    }
    return shouldStop();
}
/**
 * Bir düğümü, kısa rate-limit retry'ları (Faz 9.2, `runNodeHeadlessWithRetry`) tükense
 * bile AYNI düğüm üzerinde uzun limit bekleme (roadmap 12.7) ile devam ettirir. `running`
 * durumundaki bir düğüm `computeNext` tarafından bir daha ASLA "ready" sayılmaz — bu
 * yüzden limit sonrası retry, dış döngüye `continue` ile DEĞİL, bu iç döngüyle yapılır.
 */
async function executeNodeWithLimitHandling(nodeId, opts) {
    const { graphRootDir, agentsDir, notifier, poller, lang } = opts;
    const chunkMs = opts.pollIntervalMs ?? 15_000;
    let previousIntervalMs;
    for (;;) {
        const { graph, config } = loadFresh(graphRootDir);
        const node = graph.nodesById.get(nodeId);
        if (!node)
            return { kind: "failed" };
        // Roadmap 13 — ekip modu açıksa atama `config.team.*`'tan gelir (`config.routing`'e
        // bağımlı değil); yürütme motorunun kendisi (Mod B, `runNodeHeadlessWithRetry`) AYNI.
        const route = config.team.enabled ? resolveTeamRoute(node, config) : resolveRoute(node, config);
        writeContextFile(graph, node.id, config);
        const contextMd = readFileSync(join(graphRootDir, "_runtime", `${node.id}.context.md`), "utf-8");
        const agentDef = readAgentDefinition(join(agentsDir, `${route.agent}.md`));
        setFrontmatter(graph, node.id, { status: "running" });
        const result = runNodeHeadlessWithRetry(contextMd, agentDef, route, {
            enabled: config.mode_b.rate_limit_retry.enabled,
            waitSeconds: config.mode_b.rate_limit_retry.wait_seconds,
            maxRetries: config.mode_b.rate_limit_retry.max_retries,
        }, opts.spawner, opts.shortRetrySleep);
        if (result.ok) {
            setFrontmatter(loadFresh(graphRootDir).graph, node.id, { status: "done" });
            emitEvent(graphRootDir, { type: "node_done", nodeId: node.id });
            if (config.autopilot.git.commit) {
                const summary = String(node.frontmatter.summary ?? "");
                commitAll(opts.projectRoot ?? dirname(graphRootDir), `gp(${node.id}): ${summary}`, opts.git);
            }
            return { kind: "done" };
        }
        if (!result.rateLimited) {
            // Roadmap 13.5 — ekip modunda doğrudan `failed` DEĞİL: önce escalation zinciri
            // (junior(haiku)→junior(sonnet)→senior, tester(haiku)→tester(upgrade_to)) denenir.
            // Zincir tükendiyse (escalated:false) normal `failed` akışına düşer.
            if (config.team.enabled) {
                const escalation = escalateTeamNode(loadFresh(graphRootDir).graph, node.id, config);
                emitEvent(graphRootDir, {
                    type: "escalated",
                    nodeId: node.id,
                    data: { fromRole: escalation.fromRole, toRole: escalation.toRole, escalated: escalation.escalated },
                });
                if (escalation.escalated)
                    continue;
            }
            failNode(loadFresh(graphRootDir).graph, node.id, "Mod B: claude -p başarısız");
            emitEvent(graphRootDir, { type: "failure", nodeId: node.id, message: "claude -p başarısız" });
            return { kind: "failed" };
        }
        // Kısa retry'lar (Faz 9.2) tükendi — 12.7'nin uzun bekleme katmanı.
        const classification = classifyLimitError(`${result.stdout}\n${result.stderr}`);
        const plan = planLimitWait(classification, {
            maxWaitHours: config.autopilot.limits.max_wait_hours,
            previousIntervalMs,
            now: opts.now(),
        });
        if (plan.action === "stop_unresolvable") {
            emitEvent(graphRootDir, { type: "failure", nodeId: node.id, message: "spend_limit_or_unknown" });
            await notifier.send(lang === "tr"
                ? `🛑 Harcama limiti ya da tanımlanamayan bir hata — bekleyerek çözülmez. ${node.id} üzerinde durduruldu.`
                : `🛑 Spend limit or an unclassified error — cannot be resolved by waiting. Stopped at ${node.id}.`);
            return { kind: "stop", reason: "spend_limit" };
        }
        if (plan.action === "give_up") {
            emitEvent(graphRootDir, { type: "failure", nodeId: node.id, message: "max_wait_exceeded" });
            await notifier.send(lang === "tr"
                ? `🛑 Maksimum bekleme süresi (${config.autopilot.limits.max_wait_hours}sa) aşıldı. ${node.id} üzerinde durduruldu.`
                : `🛑 Max wait time (${config.autopilot.limits.max_wait_hours}h) exceeded. Stopped at ${node.id}.`);
            return { kind: "stop", reason: "max_wait_exceeded" };
        }
        const counts = countTasks(loadFresh(graphRootDir).graph);
        await notifyLimit({
            graphRootDir,
            notifier,
            lang,
            resetHint: classification.resetHint,
            doneCount: counts.done,
            totalCount: counts.total,
        });
        const stoppedDuringWait = await waitWhilePolling(plan.waitMs, chunkMs, poller, opts.sleep, () => false);
        if (stoppedDuringWait)
            return { kind: "stop", reason: "user_stop" };
        previousIntervalMs = plan.nextIntervalMs || undefined;
        await sendRoutine(notifier, config, opts.now, resumeMessage(lang, { nodeId: node.id }).text);
        emitEvent(graphRootDir, { type: "resumed", nodeId: node.id });
    }
}
/**
 * Roadmap 12 (mimari) — "Yürütücü" + "Zamanlayıcı" + "Onay kuyruğu"nu tek bir döngüde
 * birleştirir; "Bildirim" `Notifier` arayüzü üzerinden (12.4), "Olay yolu" `eventBus.ts`
 * üzerinden (12.3) ayrıdır. `/gp:run`/`gp run`'ın İLK/TEMEL sürümünün (6.9/9.2) tek-düğüm-
 * seç-çalıştır döngüsü üzerine kurulur; escalation/fix_loop Mod B'de henüz entegre DEĞİL
 * (bilinen, önceden belgelenen kapsam sınırı — roadmap 6.9/9.2) — gerçek başarısızlık
 * doğrudan `failed` olur ve onay akışına (12.6) girer.
 */
export async function runAutopilotLoop(options) {
    const { graphRootDir, notifier, poller, lang } = options;
    const sleep = options.sleep ?? defaultSleep;
    const now = options.now ?? (() => Date.now());
    const opts = { ...options, sleep, now };
    let paused = false;
    let stopRequested = false;
    let processedCount = 0;
    // Roadmap 13.10 — "bağımsız iş kalmazsa 'bekliyorum' der" (SADECE bu duruma YENİ
    // girildiğinde, her turda tekrar DEĞİL) + 4 saatlik periyodik hatırlatma.
    let idleWaitingNoticeSent = false;
    let lastReminderAt = 0;
    // Faz 12.13 — `/run <EPIC>` kapsamı config'teki `autopilot.scope`'un yerine geçer;
    // komut dinleyicide yalnız kaydedilir, dal/genişletme işi döngünün başında yapılır.
    let scopeOverride;
    let pendingRunEpicId;
    // `idle_wait` açıkken kapsam bitti ya da genişletme başarısız oldu: yeni bir `/run`
    // gelene kadar yalnız komut dinlenir.
    let waitingForCommand = false;
    poller.onCommandMessage((_chatId, command, args) => {
        switch (command) {
            case "/run": {
                const target = parseRunTarget(loadFresh(graphRootDir).graph, args, lang);
                if (!target.ok) {
                    void notifier.send(`⚠️ ${target.error}`);
                    break;
                }
                pendingRunEpicId = target.epic.id;
                break;
            }
            case "/epics":
                void notifier.send(epicsListText(loadFresh(graphRootDir).graph, lang));
                break;
            case "/help":
            case "/start":
                void notifier.send(helpText(lang));
                break;
            case "/pause":
                paused = true;
                void notifier.send(lang === "tr" ? "⏸ Duraklatıldı." : "⏸ Paused.");
                break;
            case "/resume":
                paused = false;
                void notifier.send(lang === "tr" ? "▶️ Sürdürülüyor." : "▶️ Resumed.");
                break;
            case "/stop":
                stopRequested = true;
                void notifier.send(lang === "tr" ? "🛑 Güvenli durdurma istendi." : "🛑 Safe stop requested.");
                break;
            case "/status": {
                const { graph } = loadFresh(graphRootDir);
                const s = computeStatusSummary(graph);
                const text = Object.entries(s.byStatus)
                    .sort()
                    .map(([k, v]) => `${k}: ${v}`)
                    .join(" · ");
                void notifier.send(`📊 ${text || "(boş graph)"}`);
                break;
            }
            case "/report": {
                const { done, total } = countTasks(loadFresh(graphRootDir).graph);
                void notifier.send(lang === "tr" ? `📄 ${done}/${total} görev tamam.` : `📄 ${done}/${total} tasks done.`);
                break;
            }
            case "/questions": {
                const pending = pendingDecisionNodes(loadFresh(graphRootDir).graph);
                if (pending.length === 0) {
                    void notifier.send(lang === "tr" ? "✓ Bekleyen karar yok." : "✓ No pending decisions.");
                    break;
                }
                const lines = pending.map((n) => `· ${n.id} — ${lastErrorLine(n)}`);
                void notifier.send((lang === "tr" ? `❓ ${pending.length} karar bekliyor:\n` : `❓ ${pending.length} pending decisions:\n`) +
                    lines.join("\n"));
                break;
            }
            default:
                break; // 12.8 — bilinmeyen/serbest metin komut hiçbir şey yapmaz
        }
    });
    for (;;) {
        await poller.pollOnce(0);
        if (stopRequested)
            return { processedCount, stopReason: "user_stop" };
        if (opts.maxNodes !== undefined && processedCount >= opts.maxNodes) {
            return { processedCount, stopReason: "finished" };
        }
        if (paused) {
            await sleep(opts.pollIntervalMs ?? 2_000);
            continue;
        }
        if (pendingRunEpicId) {
            const epicId = pendingRunEpicId;
            pendingRunEpicId = undefined;
            scopeOverride = `epic:${epicId}`;
            waitingForCommand = false;
            idleWaitingNoticeSent = false;
            const { graph: g, config: c } = loadFresh(graphRootDir);
            let branchNote = "";
            if (c.autopilot.git.branch_per_epic || c.workflow.branch_per_epic) {
                const branch = epicBranchName(g.nodesById.get(epicId));
                const ok = checkoutBranch(opts.projectRoot ?? dirname(graphRootDir), branch, opts.git);
                branchNote = ok ? ` · ${lang === "tr" ? "dal" : "branch"}: ${branch}` : ` · ⚠️ ${branch} açılamadı`;
            }
            await notifier.send(lang === "tr" ? `▶️ ${epicId} başlatılıyor${branchNote}` : `▶️ Starting ${epicId}${branchNote}`);
        }
        if (waitingForCommand) {
            await sleep(opts.pollIntervalMs ?? 2_000);
            continue;
        }
        const { graph, config } = loadFresh(graphRootDir);
        const scope = scopeOverride ?? config.autopilot.scope;
        const next = computeNext(graph);
        const readyInScope = next.ready.filter((n) => inScope(n, scope));
        if (readyInScope.length > 0) {
            idleWaitingNoticeSent = false;
            const outcome = await executeNodeWithLimitHandling(readyInScope[0].id, opts);
            if (outcome.kind === "stop")
                return { processedCount, stopReason: outcome.reason };
            if (outcome.kind === "done") {
                processedCount += 1;
                await handleEpicCompletionIfAny(readyInScope[0].id, opts);
            }
            continue;
        }
        // Faz 12.13 — hazır görev yoksa kapsamdaki ilk açılmamış epic/feature'ı headless
        // planner'la genişlet. "all" kapsamında yapılmaz: eski davranış (yalnız var olan
        // task'lar) korunur, otopilot kendiliğinden tüm projeyi açmaya başlamaz.
        const candidate = scope === "all" ? undefined : expandCandidateInScope(graph, scope);
        if (candidate) {
            const expansion = expandHeadless(candidate, { agentsDir: opts.agentsDir, config, spawner: opts.spawner });
            const stillClosed = loadFresh(graphRootDir).graph.nodesById.get(candidate.id)?.frontmatter.expanded === false;
            if (expansion.ok && !stillClosed) {
                await sendRoutine(notifier, config, now, lang === "tr" ? `🧩 ${candidate.id} görevlere bölündü.` : `🧩 ${candidate.id} expanded.`);
                continue;
            }
            emitEvent(graphRootDir, { type: "failure", nodeId: candidate.id, message: "expansion_failed" });
            await notifier.send(lang === "tr"
                ? `🛑 ${candidate.id} görevlere bölünemedi (${expansion.error ?? "planner graph'ı güncellemedi"}). /run ile tekrar dene.`
                : `🛑 Could not expand ${candidate.id} (${expansion.error ?? "planner did not update the graph"}). Retry with /run.`);
            if (!config.autopilot.idle_wait)
                return { processedCount, stopReason: "finished" };
            waitingForCommand = true;
            continue;
        }
        const deadlock = computeDeadlockReport(graph);
        if (deadlock.isDeadlocked) {
            await notifyDeadlock({ graphRootDir, notifier, lang, reasons: deadlock.reasons });
            return { processedCount, stopReason: "deadlock" };
        }
        const needingApproval = [...graph.nodesById.values()].find((n) => n.kind === "task" && needsApproval(n, config));
        if (needingApproval) {
            const outcome = await requestApproval({
                graph,
                graphRootDir,
                config,
                notifier,
                lang,
                node: needingApproval,
                attempts: Number(needingApproval.frontmatter.attempts ?? 1),
                lastError: lastErrorLine(needingApproval),
            });
            if (outcome.decision === "stop")
                return { processedCount, stopReason: "user_stop" };
            idleWaitingNoticeSent = false;
            continue;
        }
        const { done, total } = countTasks(graph);
        const finished = scope === "all" ? total > 0 && done === total : scopeDone(graph, scope);
        if (finished && config.autopilot.idle_wait) {
            // Faz 12.13 — kapanmak yerine bir kez bildirip komut bekle.
            emitEvent(graphRootDir, { type: "finished" });
            await notifier.send(lang === "tr"
                ? `🏁 ${scope} tamamlandı. Sıradaki için /run <EPIC> yaz (liste: /epics).`
                : `🏁 ${scope} done. Send /run <EPIC> to continue (see /epics).`);
            waitingForCommand = true;
            continue;
        }
        if (finished) {
            emitEvent(graphRootDir, { type: "finished" });
            await notifier.send(finishedMessage(lang, {
                taskCount: total,
                // Roadmap 8.1/Açık Soru #4 — Mod B'nin `--output-format json` `usage` alan
                // adları henüz DOĞRULANMADI; icat etmemek için token sayısı burada 0 (bilinmiyor)
                // gösterilir — gerçek sayı, `usage` doğrulandığında bu fonksiyona eklenecek.
                tokens: 0,
                escalations: 0,
                reportPath: ".graph/_metrics/report.md",
            }).text);
            return { processedCount, stopReason: "finished" };
        }
        // Hazır düğüm yok, deadlock yok, onay bekleyen yok, ama bitmemiş var (ör. hepsi
        // needs_decision/running) — roadmap 13.10: bu duruma YENİ girildiyse bir kez bildir,
        // sonra sadece 4 saatte bir hatırlat (sessiz saatler hariç — `sendRoutine`).
        const pending = pendingDecisionNodes(graph);
        if (pending.length > 0) {
            if (!idleWaitingNoticeSent) {
                idleWaitingNoticeSent = true;
                lastReminderAt = now();
                await sendRoutine(notifier, config, now, lang === "tr"
                    ? "⏳ Tüm kalan işler kararlarına bağlı, bekliyorum."
                    : "⏳ All remaining work depends on pending decisions — waiting.");
            }
            else if (now() - lastReminderAt >= REMINDER_INTERVAL_MS) {
                lastReminderAt = now();
                await sendRoutine(notifier, config, now, lang === "tr" ? `❓ ${pending.length} karar bekliyor.` : `❓ ${pending.length} decisions pending.`);
            }
        }
        await sleep(opts.pollIntervalMs ?? 2_000);
    }
}
async function handleEpicCompletionIfAny(justFinishedNodeId, opts) {
    const { graph, config } = loadFresh(opts.graphRootDir);
    const node = graph.nodesById.get(justFinishedNodeId);
    if (!node?.epicId)
        return;
    const epicDone = computeEpicDone(graph, node.epicId);
    if (!epicDone.done)
        return;
    emitEvent(opts.graphRootDir, { type: "epic_done", epicId: node.epicId });
    const epicNode = graph.nodesById.get(node.epicId);
    let pushNote = "";
    if (config.autopilot.git.push_on_epic_done || config.workflow.push_on_epic_done) {
        const projectRoot = opts.projectRoot ?? dirname(opts.graphRootDir);
        // `git.commit: false` iken epic'in tüm işi burada tek commit'e iner; görev başına
        // commit açıksa yalnız kalıntılar (graph metrikleri vb.) girer, yoksa commit atılmaz.
        commitAll(projectRoot, `gp(${node.epicId}): ${String(epicNode?.frontmatter.summary ?? epicNode?.name ?? "")}`, opts.git);
        const pushed = pushCurrentBranch(projectRoot, opts.git);
        if (opts.lang === "tr")
            pushNote = pushed ? " · ⬆️ dal push'landı" : " · ⚠️ push başarısız";
        else
            pushNote = pushed ? " · ⬆️ branch pushed" : " · ⚠️ push failed";
    }
    await sendRoutine(opts.notifier, config, opts.now, epicDoneMessage(opts.lang, {
        epicId: node.epicId,
        epicTitle: epicNode?.name ?? node.epicId,
        taskCount: epicDone.total,
        tokens: 0,
    }).text + pushNote);
}
