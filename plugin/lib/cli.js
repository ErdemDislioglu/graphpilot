import { Command } from "commander";
import { parseGraph } from "./graph/parser.js";
import { validateGraph } from "./validate.js";
import { generateEpicIndex, generateRootIndex } from "./indexGen.js";
import { computeNext } from "./next.js";
import { computeStatusSummary } from "./status.js";
import { setFrontmatter } from "./set.js";
import { resolveRoute } from "./route.js";
import { writeContextFile } from "./context.js";
import { writeRepoMap } from "./repomap.js";
import { createNewNode } from "./newNode.js";
import { buildResumeSummary } from "./resume.js";
import { initGraph } from "./init.js";
import { runDoctor } from "./doctor.js";
import { setBrief } from "./brief.js";
import { applyFlagFixes, computeFlagFixes } from "./fixFlags.js";
import { runChecks, runVerify } from "./checks.js";
import { extractAcceptanceCriteria, readGitDiff, runAcceptanceCheck } from "./check.js";
import { applyRollup } from "./rollup.js";
import { applyPlan } from "./apply.js";
import { claimTasks, completeTasks, computeChain, finishTask, gateTask, notifyEpicsDone, planWorkers, refreshGraphState, startTasks, } from "./orchestrate.js";
import { escalateNode } from "./escalate.js";
import { failNode } from "./fail.js";
import { findExpandCandidates } from "./expandCandidates.js";
import { recordFixLoopRound, computeFixLoopStatus, computeFixLoopTokenRatio, readFixLoopRounds, } from "./fixLoop.js";
import { computeLowComplexityBatches } from "./batching.js";
import { computeEpicDone } from "./epicStatus.js";
import { runScaffold } from "./scaffold.js";
import { computeAgentStats } from "./agentStats.js";
import { computeAblationRows, renderAblationMarkdown } from "./ablation.js";
import { parseTranscriptUsage, summarizeTranscript } from "./metricsIngest.js";
import { loadFastConfig } from "./hooks/fastConfig.js";
import { computeTrimmedBashOutput } from "./hooks/trimBash.js";
import { computeTrackToolUse } from "./hooks/trackToolUse.js";
import { computeRunGuard, readContextTokens } from "./hooks/runGuard.js";
import { appendMetric } from "./metrics.js";
import { decideRunningNodeRecovery, findOrphanWipCommits } from "./recover.js";
import { computeDeadlockReport } from "./deadlock.js";
import { checkTouchesViolation, readRunningNodesTouches } from "./hooks/touchesGuard.js";
import { computeAllKnowledgeSyncReports, defaultFileHashReader, setKnowledgeSourceHashes, } from "./sourceHash.js";
import { readAgentDefinition } from "./agentFile.js";
import { runNodeHeadlessWithRetry } from "./runModeB.js";
import { writeFileAtomic } from "./atomicWrite.js";
import { existsSync, mkdirSync, readFileSync, openSync } from "node:fs";
import { ConfigSchema } from "./schema/index.js";
import { basename, isAbsolute, join, relative, resolve as resolvePath } from "node:path";
import { execSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { runAutopilotLoop } from "./autopilot/autopilotLoop.js";
import { loadProjectSecrets, projectKey, writeSecretsFile } from "./autopilot/secrets.js";
import { checkLock, removeLock, writeLock } from "./autopilot/processLock.js";
import { TelegramClient } from "./autopilot/telegramClient.js";
import { TelegramPoller } from "./autopilot/telegramPoller.js";
import { TelegramNotifier } from "./autopilot/telegramNotifier.js";
import { RetryingNotifier } from "./autopilot/notifier.js";
import { resolveAssignment, resolveTeamRoute } from "./team/assign.js";
import { escalateTeamNode } from "./team/teamEscalate.js";
import { findDecision, markDecisionOverridden, readDecisions, recordDecision } from "./team/decisionLog.js";
import { computeMisTagRatio, summarizeMisTags } from "./team/tagging.js";
import { parseFinding } from "./team/finding.js";
import { computeFindingImpact, FINDING_KIND_TO_SITUATION } from "./team/findingHandler.js";
import { decideManagerAction } from "./team/managerPolicy.js";
import { decisionNeededMessage, formatImpactText } from "./autopilot/messages.js";
import { emitEvent } from "./autopilot/eventBus.js";
import { appendErrorHistoryLine } from "./errorHistory.js";
function loadGraph(opts) {
    return parseGraph(opts.graphRoot);
}
function loadConfig(graph) {
    const result = ConfigSchema.safeParse(graph.rawConfig);
    if (!result.success) {
        throw new Error(`config.yml geçersiz veya eksik: ${result.error.issues.map((i) => i.message).join("; ")}`);
    }
    return result.data;
}
function output(opts, data, human) {
    if (opts.json)
        console.log(JSON.stringify(data, null, 2));
    else
        console.log(human());
}
/** Her action'ı sarar: domain hatalarını (Error) stderr'e düz mesaj basar, exitCode=1 — yığın izi değil. */
function action(fn) {
    return (...args) => {
        try {
            fn(...args);
        }
        catch (err) {
            console.error(`hata: ${err instanceof Error ? err.message : String(err)}`);
            process.exitCode = 1;
        }
    };
}
/** `action()`'ın async sürümü — Faz 12 otopilot komutları (Telegram ağ çağrıları,
 * süreç yönetimi) için. `bin.ts`/`cli.test.ts` zaten `parseAsync` kullanıyor. */
function asyncAction(fn) {
    return async (...args) => {
        try {
            await fn(...args);
        }
        catch (err) {
            console.error(`hata: ${err instanceof Error ? err.message : String(err)}`);
            process.exitCode = 1;
        }
    };
}
/**
 * Faz 7.3/7.7 ❗ — hook komutları `action()`'ın aksine HİÇBİR ZAMAN görünür hata
 * basmaz/exitCode=1 vermez: hook plugin yüklenir yüklenmez her ilgili tool çağrısında
 * ateşlenir (GP'yi hiç kullanmayan oturumlarda bile), bu yüzden içeride ne olursa olsun
 * sessizce `{}` (değişiklik yok) döner — "başka oturumları etkilememe" kuralı.
 */
function hookAction(fn) {
    return () => {
        try {
            fn();
        }
        catch {
            process.stdout.write("{}");
        }
    };
}
function readStdinJson() {
    try {
        const raw = readFileSync(0, "utf-8");
        return raw.trim() ? JSON.parse(raw) : {};
    }
    catch {
        return {};
    }
}
export function buildCli() {
    const program = new Command();
    program
        .name("gp")
        .description("GraphPilot — graph üzerindeki deterministik işler. Hiçbir komut LLM çağırmaz.");
    /**
     * Faz 15 — `-p` her graph komutunda: eskiden yalnız 14 komut kabul ediyordu, ana thread
     * `-p <kök>`'ü (skill'in öğrettiği biçim) `resume`/`config`'e de verip hata alıyor ve tur
     * kaybediyordu. Kullanmayan komut için zararsız.
     */
    function withGraphRoot(cmd) {
        return cmd
            .option("-g, --graph-root <path>", "graph kök dizini", "./.graph")
            .option("-p, --project-root <path>", "proje kökü", ".")
            .option("--json", "makine-okur JSON çıktı");
    }
    withGraphRoot(program
        .command("init")
        .description("`.graph/` iskeleti: brief.md + config.yml varsayılanları (idempotent)")).action(action((opts) => {
        const result = initGraph(opts.graphRoot);
        output(opts, result, () => [
            ...result.created.map((p) => `✓ oluşturuldu: ${p}`),
            ...result.skipped.map((p) => `· zaten var, dokunulmadı: ${p}`),
        ].join("\n"));
    }));
    withGraphRoot(program.command("doctor").description("Kurulum, Node sürümü, .graph/ sağlığı kontrolü")).action(action((opts) => {
        const checks = runDoctor(opts.graphRoot);
        const allOk = checks.every((c) => c.ok);
        output(opts, { checks, ok: allOk }, () => checks.map((c) => `${c.ok ? "✓" : "✗"} ${c.name}: ${c.detail}`).join("\n"));
        if (!allOk)
            process.exitCode = 1;
    }));
    withGraphRoot(program
        .command("brief")
        .description("brief.md'yi bir dosyadan GERÇEK içerikle değiştirir (idempotent değil)"))
        .requiredOption("--file <path>", "brief içeriğini taşıyan dosya (planner Bash/heredoc ile yazar)")
        .action(action((opts) => {
        setBrief(opts.graphRoot, opts.file);
        output(opts, { ok: true }, () => "✓ brief.md yazıldı.");
    }));
    withGraphRoot(program
        .command("validate")
        .description("Zod şema + link + döngü + token kurallarına karşı doğrula"))
        .option("--fix-flags", "deterministik flag düzeltmelerini uygula (SPEC §10), sonra doğrula")
        .action(action((opts) => {
        let graph = loadGraph(opts);
        let fixes = [];
        if (opts.fixFlags) {
            fixes = computeFlagFixes(graph);
            if (fixes.length > 0) {
                applyFlagFixes(graph, fixes);
                graph = loadGraph(opts); // flag'ler değişti, yeniden oku
            }
        }
        const issues = validateGraph(graph);
        const hasError = issues.some((i) => i.severity === "error");
        output(opts, { fixes, issues }, () => [
            ...fixes.map((f) => `✓ düzeltildi: ${f.nodeId}.${f.field} ${JSON.stringify(f.from)} → ${JSON.stringify(f.to)}`),
            issues.length === 0
                ? `✓ Graph geçerli (${graph.nodesById.size} düğüm).`
                : issues
                    .map((i) => `[${i.severity}] ${i.nodeId ?? i.file ?? "-"}: ${i.message}`)
                    .join("\n"),
        ].join("\n"));
        if (hasError)
            process.exitCode = 1;
    }));
    withGraphRoot(program.command("index").description("INDEX.md ve her epic'in _index.md'sini üret")).action(action((opts) => {
        // Faz 14 B2: indeks üretilmeden önce feature/epic durumları task'lardan türetilir.
        const { rollup, epics } = refreshGraphState(opts.graphRoot);
        output(opts, { epics, rollup }, () => [
            `✓ INDEX.md + ${epics} epic _index.md üretildi.`,
            ...rollup.map((c) => `  ↳ ${c.id}: ${c.from} → ${c.to}`),
        ].join("\n"));
    }));
    withGraphRoot(program.command("next").description("Hazır (ready) task'ları ve paralel gruplarını listele"))
        .option("--limit <n>", "en fazla N task", (v) => Number(v))
        .action(action((opts) => {
        const graph = loadGraph(opts);
        const result = computeNext(graph, { limit: opts.limit });
        // Faz 7.5 — `batch_low_nodes` açıksa aynı feature + complexity:low + aynı route'a
        // düşen task'lar için öneri grupları hesapla. Bu, `groups`'un (touches çakışmazlığı,
        // paralel çalıştırma) YERİNE geçmez — ayrı bir öneri, orkestratör ikisini birlikte okur.
        // `next` tarihsel olarak config.yml'siz de çalışır (6.1 — en ucuz çağrı); config
        // geçersiz/yoksa batching sessizce atlanır, komutun geri kalanı bozulmaz.
        let batching = null;
        try {
            const config = loadConfig(graph);
            if (config.optimizations.batch_low_nodes) {
                batching = computeLowComplexityBatches(result.ready, config);
            }
        }
        catch {
            batching = null;
        }
        output(opts, {
            ready: result.ready.map((n) => n.id),
            groups: result.groups.map((g) => g.map((n) => n.id)),
            blocked: result.blocked.map((b) => ({
                id: b.node.id,
                waitingOn: b.waitingOn.map((n) => n.id),
            })),
            cycles: result.cycles,
            ...(batching
                ? {
                    batches: batching.batches.map((b) => ({
                        nodes: b.nodes.map((n) => n.id),
                        model: b.model,
                        agent: b.agent,
                    })),
                }
                : {}),
        }, () => {
            const lines = [
                `Hazır (${result.ready.length}):`,
                ...result.ready.map((n) => `  - ${n.id}: ${String(n.frontmatter.summary ?? "")}`),
            ];
            if (batching) {
                for (const b of batching.batches) {
                    lines.push(`  📦 batch (${b.model}/${b.agent}): ${b.nodes.map((n) => n.id).join(", ")}`);
                }
            }
            if (result.cycles.length > 0)
                lines.push(`⚠ Döngü: ${result.cycles.join(" → ")}`);
            return lines.join("\n");
        });
    }));
    withGraphRoot(program.command("status").description("Durum özeti")).action(action((opts) => {
        const graph = loadGraph(opts);
        const summary = computeStatusSummary(graph);
        // Faz 9.5 — "hiç ready yok ama bitmemiş düğüm var (deadlock) → raporla".
        const deadlock = computeDeadlockReport(graph);
        output(opts, { ...summary, deadlock }, () => [
            `Toplam: ${summary.total}`,
            ...Object.entries(summary.byStatus).map(([k, v]) => `  ${k}: ${v}`),
            deadlock.isDeadlocked
                ? "\n⚠ DEADLOCK: hiç 'ready' düğüm yok, hiçbir şey çalışmıyor, ama bitmemiş düğüm var:\n" +
                    deadlock.reasons
                        .map((r) => `  - ${r.nodeId} → ${r.blockedBy} (${r.blockerStatus}) bekliyor`)
                        .join("\n")
                : "",
        ]
            .filter(Boolean)
            .join("\n"));
    }));
    withGraphRoot(program.command("set").description("Frontmatter alanlarını günceller (atomik yazma)"))
        .argument("<id>", "düğüm ID'si")
        .argument("<patches...>", "key=value biçiminde bir veya daha fazla alan")
        .action(action((id, patches, opts) => {
        const graph = loadGraph(opts);
        const patch = {};
        for (const p of patches) {
            const eq = p.indexOf("=");
            if (eq === -1)
                throw new Error(`geçersiz patch: "${p}" (key=value olmalı)`);
            patch[p.slice(0, eq)] = p.slice(eq + 1);
        }
        const result = setFrontmatter(graph, id, patch);
        if (!result.ok) {
            output(opts, result, () => result.errors.join("\n"));
            process.exitCode = 1;
            return;
        }
        // Faz 14 B2: task durumu değiştiyse feature/epic durumunu task'lardan türet.
        const rollup = applyRollup(parseGraph(opts.graphRoot));
        // Roadmap 2.6: her değişiklikten sonra ilgili indeksi otomatik güncelle.
        const fresh = parseGraph(opts.graphRoot);
        writeFileAtomic(join(opts.graphRoot, "INDEX.md"), generateRootIndex(fresh));
        const node = fresh.nodesById.get(id);
        if (node?.epicId) {
            const epic = fresh.nodesById.get(node.epicId);
            if (epic) {
                const dir = epic.filePath.replace(/\/epic\.md$/, "");
                writeFileAtomic(join(dir, "_index.md"), generateEpicIndex(fresh, node.epicId));
            }
        }
        output(opts, { ok: true, rollup }, () => [`✓ ${id} güncellendi.`, ...rollup.map((c) => `  ↳ ${c.id}: ${c.from} → ${c.to}`)].join("\n"));
    }));
    withGraphRoot(program.command("route").description("Bir task için model/agent/budget çözümle"))
        .argument("<id>", "task ID'si")
        .action(action((id, opts) => {
        const graph = loadGraph(opts);
        const config = loadConfig(graph);
        const node = graph.nodesById.get(id);
        if (!node)
            throw new Error(`düğüm bulunamadı: ${id}`);
        // 2026-10-25, kullanıcı kararı — ekip modu varsayılan AÇIK: `/gp:run`'ın kendi
        // SKILL.md'si DEĞİŞMEDİ (hâlâ `gp route <id>` çağırıyor), davranış farkı BURADA,
        // tek bir yerde — `config.team.enabled` ise `resolveTeamRoute` (Faz 13), değilse
        // eski `resolveRoute` (Faz 2/6, `config.routing` tablosu). Çıktı ŞEKLİ AYNI
        // (`{model, agent, review, budget, max_turns}`) — hiçbir tüketici fark etmez.
        const result = config.team.enabled ? resolveTeamRoute(node, config) : resolveRoute(node, config);
        output(opts, result, () => `model=${result.model} agent=${result.agent} review=${result.review} budget=${result.budget} max_turns=${result.max_turns}`);
    }));
    withGraphRoot(program
        .command("context")
        .description("Agent'a verilecek bağlam paketini üret (.graph/_runtime/<id>.context.md)"))
        .argument("<id>", "düğüm ID'si")
        .action(action((id, opts) => {
        const graph = loadGraph(opts);
        const config = loadConfig(graph);
        const result = writeContextFile(graph, id, config);
        const summary = {
            tokenEstimate: result.tokenEstimate,
            budget: result.budget,
            overBudget: result.overBudget,
            parts: result.parts,
        };
        output(opts, summary, () => [
            `✓ .graph/_runtime/${id}.context.md yazıldı.`,
            `token≈${result.tokenEstimate} / bütçe=${result.budget}${result.overBudget ? " ⚠ AŞILDI" : ""}`,
            ...result.parts.map((p) => `  - ${p.label}: ~${p.tokens} token`),
        ].join("\n"));
    }));
    program
        .command("repomap")
        .description("Proje kodunu tara, .graph/_shared/knowledge/repo-map.md üret")
        .option("-g, --graph-root <path>", "graph kök dizini", "./.graph")
        .option("-p, --project-root <path>", "taranacak proje kökü", ".")
        .option("--json", "makine-okur JSON çıktı")
        .action(action((opts) => {
        const result = writeRepoMap(opts.projectRoot, opts.graphRoot);
        output(opts, result, () => `✓ repo-map.md üretildi (${result.fileCount} dosya).`);
    }));
    withGraphRoot(program
        .command("epic-done")
        .description("Faz 7.2: epic'in tüm feature/task'ları done mu? (repo-map'i ne zaman yenile)"))
        .argument("<id>", "epic ID'si")
        .action(action((id, opts) => {
        const result = computeEpicDone(loadGraph(opts), id);
        output(opts, result, () => `${result.done ? "✓" : "·"} ${id}: ${result.doneCount}/${result.total} done`);
    }));
    withGraphRoot(program
        .command("scaffold")
        .description("Faz 7.6: `type: scaffold` task'ları için config.yml'deki resmi iskelet komutunu çalıştırır"))
        .argument("<id>", "task ID'si")
        .action(action((id, opts) => {
        const graph = loadGraph(opts);
        const config = loadConfig(graph);
        const node = graph.nodesById.get(id);
        if (!node)
            throw new Error(`düğüm bulunamadı: ${id}`);
        const result = runScaffold(node, config, opts.projectRoot);
        output(opts, result, () => !result.ran
            ? `· çalıştırılmadı: ${result.skippedReason}`
            : `${result.ok ? "✓" : "✗"} ${result.command}${result.output ? `\n${result.output}` : ""}`);
        if (result.ran && !result.ok)
            process.exitCode = 1;
    }));
    withGraphRoot(program
        .command("config")
        .description("Varsayılanları uygulanmış config.yml'i basar (skill'ler politika ayarlarını buradan okur)"))
        .option("--key <key>", "yalnız bu üst düzey anahtar (ör. efficiency)")
        .action(action((opts) => {
        const config = loadConfig(loadGraph(opts));
        if (opts.key && !(opts.key in config))
            throw new Error(`config'te böyle bir anahtar yok: ${opts.key}`);
        const data = opts.key ? config[opts.key] : config;
        output(opts, data, () => JSON.stringify(data, null, 2));
    }));
    withGraphRoot(program
        .command("apply")
        .description("Faz 14 O3: plan.json'daki düğümleri (frontmatter + gövde) doğrulayıp tek seferde yazar"))
        .argument("<plan>", "plan JSON dosyası ({ nodes: [...], expanded: [...] })")
        .option("--dry-run", "yalnız doğrula, hiçbir dosya yazma")
        .action(action((planPath, opts) => {
        let raw;
        try {
            raw = JSON.parse(readFileSync(planPath, "utf-8"));
        }
        catch (err) {
            throw new Error(`plan okunamadı/JSON değil: ${err instanceof Error ? err.message : String(err)}`);
        }
        const result = applyPlan(opts.graphRoot, raw, { dryRun: opts.dryRun });
        if (!result.ok) {
            output(opts, result, () => result.errors.map((e) => `✗ ${e}`).join("\n"));
            process.exitCode = 1;
            return;
        }
        const state = result.dryRun ? { rollup: [] } : refreshGraphState(opts.graphRoot);
        output(opts, { ...result, rollup: state.rollup }, () => result.dryRun
            ? "✓ plan geçerli (dry-run, hiçbir dosya yazılmadı)"
            : [
                ...result.created.map((n) => `✓ ${n.id}${n.ref ? ` (${n.ref})` : ""} → ${n.filePath}`),
                ...result.expanded.map((id) => `✓ ${id} expanded: true`),
            ].join("\n"));
    }));
    withGraphRoot(program.command("new").description("Yeni düğüm iskeleti oluştur (format hatası olmaz)"))
        .argument("<kind>", "epic | feature | task | knowledge")
        .requiredOption("--slug <slug>", "kebab-case slug")
        .option("--parent <id>", "epic/feature ID'si (feature/task/epic-knowledge için zorunlu)")
        .option("--summary <text>", "tek satır özet")
        .option("--shared", "knowledge için: _shared/knowledge/ altına yaz")
        .option("--depends-on <ids>", "virgülle ayrılmış ID listesi (aynı kind: task→task, feature→feature; başka feature'daki task'lar da olur; zaten var olmalı)")
        .option("--reads <names>", "sadece task: virgülle ayrılmış knowledge adı listesi (zaten var olmalı)")
        .option("--touches <globs>", "sadece task: virgülle ayrılmış glob deseni listesi")
        .option("--type <type>", "sadece task: scaffold|feature|refactor|test|docs|config|fix (varsayılan feature)")
        .option("--complexity <level>", "sadece task: low|med|high (varsayılan med)")
        .option("--risk <level>", "sadece task: low|med|high (varsayılan low)")
        .option("--context-size <size>", "sadece task: small|medium|large (varsayılan small)")
        .option("--tags <tags>", "sadece task: virgülle ayrılmış etiket listesi")
        .option("--verify <cmd>", "sadece task: doğrulama komutu (tekrarlanabilir; gp verify çalıştırır)", (v, prev = []) => [...prev, v])
        .action(action((kind, opts) => {
        if (!["epic", "feature", "task", "knowledge"].includes(kind)) {
            throw new Error(`geçersiz kind: ${kind} (epic | feature | task | knowledge)`);
        }
        const graph = loadGraph(opts);
        const splitCsv = (v) => (v ? v.split(",").map((s) => s.trim()) : undefined);
        const result = createNewNode(graph, {
            kind: kind,
            slug: opts.slug,
            parent: opts.parent,
            summary: opts.summary,
            shared: opts.shared,
            dependsOn: splitCsv(opts.dependsOn),
            reads: splitCsv(opts.reads),
            touches: splitCsv(opts.touches),
            task: {
                type: opts.type,
                complexity: opts.complexity,
                risk: opts.risk,
                context_size: opts.contextSize,
                tags: splitCsv(opts.tags),
                verify: opts.verify,
            },
        });
        output(opts, result, () => `✓ ${result.id} → ${result.filePath}`);
    }));
    withGraphRoot(program.command("resume").description("Kesinti sonrası ~500 token'lık devam özeti")).action(action((opts) => {
        const summaryMd = buildResumeSummary(loadGraph(opts));
        output(opts, { summary: summaryMd }, () => summaryMd);
    }));
    withGraphRoot(program
        .command("recover")
        .description("Faz 9.1: status:running kalmış düğümleri çöz (devam et / geri al), yetim WIP commit'leri listele"))
        .option("--dry-run", "hiçbir değişiklik yapma, sadece ne yapılacağını göster")
        .action(action((opts) => {
        const graph = loadGraph(opts);
        const runningNodes = [...graph.nodesById.values()].filter((n) => n.frontmatter.status === "running");
        const decisions = runningNodes.map(decideRunningNodeRecovery);
        const applied = [];
        for (const d of decisions) {
            if (d.action !== "revert")
                continue;
            if (opts.dryRun) {
                applied.push({ nodeId: d.nodeId, action: "revert (dry-run, uygulanmadı)" });
                continue;
            }
            const node = graph.nodesById.get(d.nodeId);
            const touches = Array.isArray(node.frontmatter.touches) ? node.frontmatter.touches : [];
            for (const pattern of touches) {
                if (typeof pattern !== "string")
                    continue;
                try {
                    execSync(`git restore -- ${JSON.stringify(pattern)}`, { cwd: opts.projectRoot });
                }
                catch {
                    // Desen hiç değişmemiş olabilir (git restore böyle bir durumda hata verir) — yoksay.
                }
            }
            setFrontmatter(graph, d.nodeId, { status: "pending" });
            applied.push({ nodeId: d.nodeId, action: "geri alındı → pending" });
        }
        const resumingIds = new Set(decisions.filter((d) => d.action === "resume").map((d) => d.nodeId));
        let orphanWip = [];
        try {
            const log = execSync("git log --format=%s", {
                cwd: opts.projectRoot,
                encoding: "utf-8",
            });
            orphanWip = findOrphanWipCommits(log.split("\n"), resumingIds);
        }
        catch {
            // git deposu yok ya da henüz commit yok — yetim WIP kontrolü atlanır.
        }
        output(opts, { decisions, applied, orphanWip }, () => [
            decisions.length === 0
                ? "(hiç 'running' kalmış düğüm yok)"
                : decisions
                    .map((d) => `${d.action === "resume" ? "▶" : "↩"} ${d.nodeId}: ${d.reason}`)
                    .join("\n"),
            orphanWip.length > 0
                ? `\n⚠ Yetim WIP commit'ler (squash edilmemiş olabilir):\n${orphanWip.map((c) => `  - ${c}`).join("\n")}`
                : "",
        ]
            .filter(Boolean)
            .join("\n"));
    }));
    withGraphRoot(program
        .command("sync")
        .description("Faz 9.3: bilgi düğümlerinin source_files'ı ile gerçek kod arasındaki hash farkını listeler"))
        .option("--update-hashes", "raporlamak yerine TÜM source_files'ın güncel hash'ini kaydet (elle onaydan sonra kullan)")
        .action(action((opts) => {
        const graph = loadGraph(opts);
        if (opts.updateHashes) {
            const updated = [];
            for (const node of graph.nodesById.values()) {
                if (node.kind !== "knowledge")
                    continue;
                const sourceFiles = Array.isArray(node.frontmatter.source_files)
                    ? node.frontmatter.source_files.filter((f) => typeof f === "string")
                    : [];
                if (sourceFiles.length === 0)
                    continue;
                const hashes = {};
                for (const relPath of sourceFiles) {
                    const hash = defaultFileHashReader(join(opts.projectRoot, relPath));
                    if (hash !== null)
                        hashes[relPath] = hash;
                }
                const result = setKnowledgeSourceHashes(node, hashes);
                if (result.ok)
                    updated.push(node.id);
            }
            output(opts, { updated }, () => updated.length === 0
                ? "(hiç source_files'ı olan knowledge düğümü yok)"
                : `✓ hash'ler güncellendi: ${updated.join(", ")}`);
            return;
        }
        const reports = computeAllKnowledgeSyncReports(graph, opts.projectRoot).filter((r) => r.files.some((f) => f.state !== "ok"));
        output(opts, { reports }, () => reports.length === 0
            ? "✓ Tüm bilgi düğümlerinin source_files'ı hash'leriyle uyumlu (ya da hiç hash kaydı yok)."
            : reports
                .map((r) => `${r.nodeId}:\n` +
                r.files
                    .filter((f) => f.state !== "ok")
                    .map((f) => {
                    if (f.state === "changed")
                        return `  ⚠ şüpheli: ${f.path} değişmiş (kod güncellendi ama bilgi düğümü güncellenmemiş olabilir)`;
                    if (f.state === "never-hashed")
                        return `  · henüz hash'lenmemiş: ${f.path} (ilk kayıt için --update-hashes)`;
                    return `  ✗ dosya bulunamadı: ${f.path}`;
                })
                    .join("\n"))
                .join("\n"));
    }));
    withGraphRoot(program
        .command("checks")
        .description("Katman 1 (sıfır token): config.yml'deki build/lint/test komutlarını çalıştırır"))
        .action(action((opts) => {
        const config = loadConfig(loadGraph(opts));
        const results = runChecks(opts.projectRoot, config.checks, undefined, {
            trimOutput: config.optimizations.log_trimming,
        });
        const hasFailure = results.some((r) => !r.ok);
        output(opts, { results }, () => results.length === 0
            ? "(config.yml'de hiç check tanımlı değil)"
            : results
                .map((r) => `${r.ok ? "✓" : "✗"} ${r.name} (${r.command})${r.output ? `\n${r.output}` : ""}`)
                .join("\n"));
        if (hasFailure)
            process.exitCode = 1;
    }));
    withGraphRoot(program
        .command("start")
        .description("Faz 14 O5: route + context + status=running (görev başına tek komut)"))
        .argument("<ids...>", "task ID'leri (birden çoksa tek agent'a verilecek sıralı zincir)")
        .option("--chain", "Faz 14 O16: tek ID'yi aynı dosya zincirindeki sıralı görevlerle genişlet")
        .action(action((ids, opts) => {
        const graph = loadGraph(opts);
        const config = loadConfig(graph);
        if (opts.chain && ids.length !== 1)
            throw new Error("--chain tek bir ID ile kullanılır");
        const resolved = opts.chain ? computeChain(graph, ids[0], config) : ids;
        const result = startTasks(opts.graphRoot, resolved, config, { projectRoot: opts.projectRoot });
        output(opts, result, () => [
            ...result.tasks.map((t) => `▶ ${t.id} → ${t.agent}/${t.model} · ${t.contextPath}`),
            result.tasks.length > 1
                ? `  zincir: tek agent ${result.group.agent}/${result.group.model}, ${result.group.max_turns} tur`
                : "",
        ]
            .filter(Boolean)
            .join("\n"));
    }));
    withGraphRoot(program
        .command("gate")
        .description("Faz 14 O5/O9: bir doğrulama turu — Katman 1 + verify + (gerekirse) Katman 2 + fix-loop kararı"))
        .argument("<id>", "task ID'si")
        .requiredOption("--round <n>", "tur numarası (1'den başlar)", (v) => Number(v))
        .action(action((id, opts) => {
        const config = loadConfig(loadGraph(opts));
        const result = gateTask(opts.graphRoot, id, config, {
            projectRoot: opts.projectRoot,
            round: opts.round,
        });
        output(opts, result, () => [
            `${result.decision.toUpperCase()} (${result.reason}) — ${result.issues.length} eksik`,
            ...result.issues.map((i) => `  - ${i}`),
            result.unverified ? "  ⚠ görev düzeyi doğrulama yapılamadı (verify: yok, Katman 2 yok)" : "",
        ]
            .filter(Boolean)
            .join("\n"));
    }));
    withGraphRoot(program
        .command("finish")
        .description("Faz 14 O5: Handoff kontrolü + done + roll-up + indeks + repo-map + git commit"))
        .argument("<id>", "task ID'si")
        .option("--base <sha>", "gp start'ın verdiği git baseline (WIP commit'ler tek commit'e iner)")
        .action(action((id, opts) => {
        const config = loadConfig(loadGraph(opts));
        const result = finishTask(opts.graphRoot, id, config, {
            projectRoot: opts.projectRoot,
            base: opts.base,
        });
        output(opts, result, () => result.ok
            ? [
                `✓ ${id} done${result.committed ? " · commit" : ""}${result.repomap ? " · repo-map" : ""}`,
                ...result.rollup.map((c) => `  ↳ ${c.id}: ${c.from} → ${c.to}`),
            ].join("\n")
            : result.errors.map((e) => `✗ ${e}`).join("\n"));
        if (!result.ok)
            process.exitCode = 1;
    }));
    /** Faz 15 — Mod A'da epic bitince Telegram özeti (`workflow.notify_epic_done`). */
    async function notifyEpicsIfEnabled(graphRoot, epicIds, config) {
        if (!config.workflow.notify_epic_done || epicIds.length === 0)
            return;
        const secrets = loadProjectSecrets(graphRoot);
        if (!secrets)
            return;
        const client = new TelegramClient(secrets.telegramBotToken);
        await notifyEpicsDone(graphRoot, epicIds, config, (text) => client.sendMessage(secrets.telegramChatId, text));
    }
    withGraphRoot(program
        .command("complete")
        .description("Faz 15: gate (tur otomatik) + geçtiyse finish + yakınsamadıysa yükselt/kuyruğa koy ya da fail"))
        .argument("<ids...>", "task ID'leri (zincirse sırayla)")
        .action(asyncAction(async (ids, opts) => {
        const config = loadConfig(loadGraph(opts));
        const result = completeTasks(opts.graphRoot, ids, config, { projectRoot: opts.projectRoot });
        await notifyEpicsIfEnabled(opts.graphRoot, result.epicsDone, config);
        output(opts, result, () => [
            ...result.done.map((d) => `✓ ${d.id}${d.committed ? " · commit" : ""}${d.unverified ? " · doğrulanmadı" : ""}`),
            ...result.fix.flatMap((f) => [`✗ ${f.id} (tur ${f.round}) düzelt:`, ...f.issues.map((i) => `  - ${i}`)]),
            ...result.requeued.map((r) => `↑ ${r.id} → ${r.agent}/${r.model} (kuyrukta)`),
            ...result.failed.map((f) => `✗ ${f.id} failed: ${f.reason}`),
            ...result.errors.flatMap((e) => e.errors.map((m) => `✗ ${e.id}: ${m}`)),
            ...result.epicsDone.map((e) => `★ ${e} bitti`),
        ].join("\n"));
    }));
    withGraphRoot(program
        .command("claim")
        .description("Faz 15 worker modu: bu rol/modele düşen ilk hazır görevi (zinciriyle) başlatır"))
        .requiredOption("--agent <agent>", "worker'ın agent'ı (coder, senior, tester, docs)")
        .requiredOption("--model <model>", "worker'ın modeli")
        .action(action((opts) => {
        const config = loadConfig(loadGraph(opts));
        const result = claimTasks(opts.graphRoot, config, {
            agent: opts.agent,
            model: opts.model,
            projectRoot: opts.projectRoot,
        });
        output(opts, result, () => result.claimed
            ? result.claimed.tasks.map((t) => `▶ ${t.id} · ${t.contextPath}`).join("\n")
            : `· görev yok (bekleyen: ${result.waiting})`);
    }));
    withGraphRoot(program.command("workers").description("Faz 15 worker modu: başlatılacak worker'lar (rol/model) ve genişletme adayları")).action(action((opts) => {
        const config = loadConfig(loadGraph(opts));
        const plan = planWorkers(opts.graphRoot, config);
        output(opts, plan, () => [
            ...plan.launch.map((w) => `▶ ${w.agent}/${w.model} — ${w.ready} hazır görev`),
            `çalışan: ${plan.running}`,
            plan.expand.length ? `genişletme: ${plan.expand.join(", ")}` : "",
            plan.finished ? "✓ bitti" : "",
        ]
            .filter(Boolean)
            .join("\n"));
    }));
    withGraphRoot(program
        .command("verify")
        .description("Faz 14 O9: görevin verify: komutlarını çalıştırır (Katman 1, sıfır token)"))
        .argument("<id>", "task ID'si")
        .action(action((id, opts) => {
        const graph = loadGraph(opts);
        const config = loadConfig(graph);
        const node = graph.nodesById.get(id);
        if (!node || node.kind !== "task")
            throw new Error(`task bulunamadı: ${id}`);
        const commands = Array.isArray(node.frontmatter.verify)
            ? node.frontmatter.verify.filter((c) => typeof c === "string")
            : [];
        const results = runVerify(opts.projectRoot, commands, undefined, {
            trimOutput: config.optimizations.log_trimming,
        });
        const ok = results.every((r) => r.ok);
        output(opts, { id, ok, verified: commands.length > 0, results }, () => commands.length === 0
            ? `· ${id}: verify: tanımlı değil (doğrulanmadı)`
            : results
                .map((r) => `${r.ok ? "✓" : "✗"} ${r.command}${r.output ? `\n${r.output}` : ""}`)
                .join("\n"));
        if (!ok)
            process.exitCode = 1;
    }));
    withGraphRoot(program
        .command("check")
        .description("Katman 2 (ADR-008): kabul kriterlerini diff'e karşı kontrol eder"))
        .argument("<id>", "task ID'si")
        .action(action((id, opts) => {
        const graph = loadGraph(opts);
        const config = loadConfig(graph);
        const node = graph.nodesById.get(id);
        if (!node)
            throw new Error(`düğüm bulunamadı: ${id}`);
        const criteria = extractAcceptanceCriteria(node);
        if (!criteria)
            throw new Error(`${id}: '## Kabul kriterleri' bölümü yok`);
        const diff = readGitDiff(opts.projectRoot);
        const result = diff.ok
            ? runAcceptanceCheck(criteria, diff.diff, { model: config.fix_loop.acceptance_check_model })
            : { success: false, results: [], error: diff.reason };
        output(opts, result, () => !result.success
            ? `✗ kontrol başarısız: ${result.error}`
            : result.results.map((r) => `[${r.durum}] ${r.kriter} — ${r.not}`).join("\n"));
        if (!result.success || result.results.some((r) => r.durum === "eksik"))
            process.exitCode = 1;
    }));
    withGraphRoot(program
        .command("escalate")
        .description("Hata politikası adım 2: bir üst modele yükselt (SPEC §6.5)"))
        .argument("<id>", "task ID'si")
        .action(action((id, opts) => {
        const graph = loadGraph(opts);
        const config = loadConfig(graph);
        // 2026-10-25 — `gp route`'la AYNI gerekçe: ekip modu varsayılan açıkken bu komut
        // `escalateTeamNode`'un zincirini (junior(haiku)→junior(sonnet)→senior) kullanır,
        // `/gp:run`'ın SKILL.md'si DEĞİŞMEDİ (hâlâ sadece `escalated` alanına bakıyor).
        if (config.team.enabled) {
            const result = escalateTeamNode(graph, id, config);
            output(opts, result, () => result.escalated ? `✓ ${result.fromRole}(${result.fromModel}) → ${result.toRole}(${result.toModel})` : `✗ ${result.reason}`);
            if (!result.escalated)
                process.exitCode = 1;
            return;
        }
        const result = escalateNode(graph, id, config);
        output(opts, result, () => result.escalated ? `✓ ${result.fromModel} → ${result.toModel}` : `✗ ${result.reason}`);
        if (!result.escalated)
            process.exitCode = 1;
    }));
    withGraphRoot(program
        .command("fail")
        .description("Hata politikası adım 3: terminal durum, bağımlıları blocked işaretle"))
        .argument("<id>", "task ID'si")
        .requiredOption("--reason <text>", "başarısızlık sebebi")
        .action(action((id, opts) => {
        const result = failNode(loadGraph(opts), id, opts.reason);
        output(opts, result, () => result.ok
            ? `✓ ${id} failed. Blocked: ${result.blockedDependents.join(", ") || "(yok)"}`
            : `✗ ${result.error}`);
        if (!result.ok)
            process.exitCode = 1;
    }));
    withGraphRoot(program
        .command("expand-candidates")
        .description("Genişletilmeye hazır epic/feature'ları listeler (SPEC §6.1)")).action(action((opts) => {
        const candidates = findExpandCandidates(loadGraph(opts));
        output(opts, { candidates }, () => candidates.length === 0
            ? "(hiçbiri — her şey genişletilmiş ya da hazır değil)"
            : candidates.map((c) => `${c.kind}: ${c.id}`).join("\n"));
    }));
    const metricsCmd = program
        .command("metrics")
        .description("Faz 8.1: token/maliyet ölçüm araçları");
    metricsCmd
        .command("ingest")
        .description("Bir transcript JSONL dosyasından gerçek token kullanımını çıkarır (SPEC §13, ADR-012)")
        .argument("<transcriptPath>", "transcript .jsonl dosyasının yolu")
        .option("--json", "makine-okur JSON çıktı")
        .action(action((transcriptPath, opts) => {
        const content = readFileSync(transcriptPath, "utf-8");
        const turns = parseTranscriptUsage(content);
        const summary = summarizeTranscript(turns);
        if (opts.json) {
            console.log(JSON.stringify(summary, null, 2));
            return;
        }
        console.log(`${summary.turns} gerçek model turu bulundu.`);
        for (const [model, s] of Object.entries(summary.byModel)) {
            console.log(`  ${model}: ${s.turns} tur, input≈${s.inputTokens}, output≈${s.outputTokens}, cache_read≈${s.cacheReadInputTokens}`);
        }
        console.log(`Toplam: input≈${summary.totalInputTokens}, output≈${summary.totalOutputTokens}, ` +
            `cache_creation≈${summary.totalCacheCreationInputTokens}, cache_read≈${summary.totalCacheReadInputTokens}`);
        if (summary.cacheReadRatio !== null) {
            console.log(`Cache okuma oranı: %${(summary.cacheReadRatio * 100).toFixed(1)}`);
        }
    }));
    const fixLoopCmd = program
        .command("fix-loop")
        .description("Doğrulama döngüsü round takibi (SPEC §6.3)");
    withGraphRoot(fixLoopCmd.command("record").description("Bir turun sonucunu _metrics'e kaydet"))
        .argument("<id>", "task ID'si")
        .requiredOption("--round <n>", "tur numarası", (v) => Number(v))
        .requiredOption("--issues <n>", "bulunan eksik sayısı", (v) => Number(v))
        .option("--tokens <n>", "bu turda kullanılan token tahmini", (v) => Number(v))
        .action(action((id, opts) => {
        recordFixLoopRound(opts.graphRoot, id, {
            round: opts.round,
            issuesCount: opts.issues,
            tokens: opts.tokens,
        });
        output(opts, { ok: true }, () => `✓ tur ${opts.round} kaydedildi (${opts.issues} eksik).`);
    }));
    withGraphRoot(fixLoopCmd.command("status").description("Devam et mi, kır mı — frenleri uygula"))
        .argument("<id>", "task ID'si")
        .action(action((id, opts) => {
        const graph = loadGraph(opts);
        const config = loadConfig(graph);
        const node = graph.nodesById.get(id);
        const nodeBudget = node && typeof node.frontmatter.context_budget === "number"
            ? node.frontmatter.context_budget
            : undefined;
        const rounds = readFixLoopRounds(opts.graphRoot, id);
        const status = computeFixLoopStatus(rounds, {
            maxRounds: config.fix_loop.max_rounds,
            nodeBudget,
            breakIfNoProgress: config.fix_loop.break_if_no_progress,
        });
        output(opts, status, () => `${status.shouldBreak ? "KIR" : "DEVAM"}: ${status.reason}`);
    }));
    withGraphRoot(fixLoopCmd
        .command("stats")
        .description("Faz 7.8: ilk tur vs sonraki turların token oranı (verimlilik ölçümü)"))
        .argument("<id>", "task ID'si")
        .action(action((id, opts) => {
        const rounds = readFixLoopRounds(opts.graphRoot, id);
        const ratio = computeFixLoopTokenRatio(rounds);
        output(opts, ratio, () => `ilk tur≈${ratio.firstRoundTokens} token, sonraki turlar toplam≈${ratio.laterRoundsTokens} token` +
            (ratio.ratio === null ? "" : ` (oran: ${ratio.ratio.toFixed(2)})`));
    }));
    withGraphRoot(program
        .command("run")
        .description("Mod B (opsiyonel, ADR-001): her düğüm için ayrı headless `claude -p` süreci. " +
        "İLK/TEMEL sürüm — doğrulama döngüsü/escalation entegre değil, düğüm başına tek deneme."))
        .requiredOption("--agents-dir <path>", "agent tanım dosyalarının (coder.md vb.) bulunduğu dizin")
        .option("--max-nodes <n>", "en fazla N düğüm işle", (v) => Number(v))
        .action(action((opts) => {
        const results = [];
        let stoppedByRateLimit = false;
        while (opts.maxNodes === undefined || results.length < opts.maxNodes) {
            const graph = loadGraph(opts);
            const config = loadConfig(graph);
            const next = computeNext(graph, { limit: 1 });
            if (next.ready.length === 0)
                break;
            const node = next.ready[0];
            const route = resolveRoute(node, config);
            writeContextFile(graph, node.id, config);
            const contextMd = readFileSync(join(opts.graphRoot, "_runtime", `${node.id}.context.md`), "utf-8");
            const agentDef = readAgentDefinition(join(opts.agentsDir, `${route.agent}.md`));
            setFrontmatter(graph, node.id, { status: "running" });
            // Faz 9.2: rate limit/kullanım limiti görülürse config'teki ayarla bekleyip
            // tekrar dener; hâlâ engelleniyorsa düğümü `failed` SAYMAZ (geçici bir kesinti,
            // task'ın hatası değil) — `running` kalır, döngü durur; bir sonraki oturum
            // `gp resume`/`gp recover` (9.1) ile güvenle devam eder.
            const result = runNodeHeadlessWithRetry(contextMd, agentDef, route, {
                enabled: config.mode_b.rate_limit_retry.enabled,
                waitSeconds: config.mode_b.rate_limit_retry.wait_seconds,
                maxRetries: config.mode_b.rate_limit_retry.max_retries,
            });
            if (result.ok) {
                setFrontmatter(loadGraph(opts), node.id, { status: "done" });
                applyRollup(loadGraph(opts)); // Faz 14 B2
                results.push({ id: node.id, ok: true });
            }
            else if (result.rateLimited) {
                results.push({ id: node.id, ok: false, rateLimited: true });
                stoppedByRateLimit = true;
                break;
            }
            else {
                failNode(loadGraph(opts), node.id, "Mod B: claude -p başarısız (ilk sürüm, retry yok)");
                results.push({ id: node.id, ok: false });
            }
        }
        output(opts, { processed: results, stoppedByRateLimit }, () => [
            results.length === 0
                ? "(işlenecek düğüm yok)"
                : results
                    .map((r) => `${r.ok ? "✓" : r.rateLimited ? "⏸" : "✗"} ${r.id}`)
                    .join("\n"),
            stoppedByRateLimit
                ? `\n⏸ Kullanım limiti nedeniyle durduruldu. ${results.at(-1).id} düğümünden devam edilecek (gp resume / gp recover).`
                : "",
        ]
            .filter(Boolean)
            .join("\n"));
    }));
    const autopilotCmd = program
        .command("autopilot")
        .description("Roadmap Faz 12 — insansız yürütme, Telegram bildirim/onay");
    withGraphRoot(autopilotCmd
        .command("setup")
        .description("Telegram botunu bağlar: token'ı doğrular, bota gönderilecek /start'ı bekler, " +
        "chat ID'yi ~/.graphpilot/secrets.json'a BU PROJE için kaydeder (her projenin kendi " +
        "botu olabilir), test mesajı yollar"))
        .requiredOption("--token <token>", "Telegram bot token'ı (@BotFather'dan alınır)")
        .option("--wait-seconds <n>", "'/start' için en fazla kaç saniye beklenir", (v) => Number(v), 30)
        .option("--global", "projeye özel değil, kendi botu olmayan projelerin düştüğü global bot olarak kaydet")
        .action(asyncAction(async (opts) => {
        const client = new TelegramClient(opts.token);
        const me = await client.getMe();
        console.log(`✓ Bot doğrulandı: @${me.username ?? me.first_name}`);
        console.log("Telegram'da botuna /start gönder (bekleniyor)...");
        const deadlineMs = Date.now() + opts.waitSeconds * 1000;
        let chatId = null;
        while (Date.now() < deadlineMs && chatId === null) {
            const updates = await client.getUpdates(0, 3);
            const started = updates.find((u) => u.message?.text === "/start");
            if (started?.message)
                chatId = started.message.chat.id;
        }
        if (chatId === null) {
            throw new Error(`${opts.waitSeconds}s içinde /start gelmedi — Telegram'da botu bulup tekrar dene`);
        }
        const project = basename(projectKey(opts.graphRoot));
        writeSecretsFile({ telegramBotToken: opts.token, telegramChatId: String(chatId) }, undefined, opts.global ? undefined : opts.graphRoot);
        await client.sendMessage(chatId, opts.global ? "✅ GraphPilot otopilot bağlandı (global)." : `✅ GraphPilot otopilot bağlandı · proje: ${project}`);
        console.log(`✓ chat ID kaydedildi (${chatId}${opts.global ? ", global" : `, proje: ${projectKey(opts.graphRoot)}`}), test mesajı gönderildi.`);
    }));
    withGraphRoot(autopilotCmd
        .command("notify")
        .description("Bu projenin Telegram sohbetine düz bir mesaj gönderir (projenin kendi botu yoksa global bota)"))
        .argument("<text>", "gönderilecek mesaj")
        .action(asyncAction(async (text, opts) => {
        const secrets = loadProjectSecrets(opts.graphRoot);
        if (!secrets)
            throw new Error("Telegram bağlı değil — önce 'gp autopilot setup --token <TOKEN>' çalıştır");
        await new TelegramClient(secrets.telegramBotToken).sendMessage(secrets.telegramChatId, text);
        output(opts, { sent: true }, () => "✓ gönderildi");
    }));
    withGraphRoot(autopilotCmd
        .command("start")
        .description("Otopilotu arka planda başlatır (detached süreç). launchd/systemd/Windows " +
        "görev zamanlayıcıyla kalıcı 7/24 kurulum roadmap 12.10'un elle adımıdır, bu komut değil."))
        .requiredOption("--agents-dir <path>", "agent tanım dosyalarının (coder.md vb.) bulunduğu dizin")
        .action(asyncAction(async (opts) => {
        const graph = loadGraph(opts);
        const config = loadConfig(graph);
        if (!config.autopilot.enabled) {
            throw new Error("autopilot.enabled: false (config.yml) — başlatmadan önce true yap");
        }
        const lock = checkLock(opts.graphRoot);
        if (lock.locked)
            throw new Error(`otopilot zaten çalışıyor (PID ${lock.info.pid})`);
        if (!loadProjectSecrets(opts.graphRoot)) {
            throw new Error("Telegram bağlı değil — önce 'gp autopilot setup --token <TOKEN>' çalıştır");
        }
        const runtimeDir = join(opts.graphRoot, "_runtime");
        mkdirSync(runtimeDir, { recursive: true });
        const logPath = join(runtimeDir, "autopilot.log");
        const logFd = openSync(logPath, "a");
        const binPath = fileURLToPath(new URL("./bin.js", import.meta.url));
        const child = spawn(process.execPath, [
            binPath,
            "autopilot",
            "run-loop-internal",
            "-g",
            resolvePath(opts.graphRoot),
            "--agents-dir",
            resolvePath(opts.agentsDir),
        ], { detached: true, stdio: ["ignore", logFd, logFd] });
        child.unref();
        if (!child.pid)
            throw new Error("alt süreç başlatılamadı (pid yok)");
        writeLock(opts.graphRoot, child.pid);
        console.log(`✓ otopilot başlatıldı (PID ${child.pid}). Loglar: ${logPath}`);
    }));
    withGraphRoot(autopilotCmd.command("stop").description("Çalışan otopilotu güvenli şekilde durdurur (SIGTERM)")).action(action((opts) => {
        const lock = checkLock(opts.graphRoot);
        if (!lock.locked) {
            if (lock.stale)
                removeLock(opts.graphRoot);
            output(opts, { stopped: false }, () => "otopilot çalışmıyor.");
            return;
        }
        process.kill(lock.info.pid, "SIGTERM");
        removeLock(opts.graphRoot);
        output(opts, { stopped: true, pid: lock.info.pid }, () => `✓ durduruldu (PID ${lock.info.pid}).`);
    }));
    withGraphRoot(autopilotCmd.command("status").description("Otopilot süreci çalışıyor mu?")).action(action((opts) => {
        const lock = checkLock(opts.graphRoot);
        if (lock.stale)
            removeLock(opts.graphRoot);
        output(opts, { running: lock.locked, info: lock.info }, () => lock.locked
            ? `● çalışıyor (PID ${lock.info.pid}, başladı: ${lock.info.startedAt})`
            : "○ çalışmıyor");
    }));
    withGraphRoot(autopilotCmd.command("logs").description("Otopilot log dosyasının son satırları"))
        .option("-n, --lines <n>", "son N satır", (v) => Number(v), 50)
        .action(action((opts) => {
        const logPath = join(opts.graphRoot, "_runtime", "autopilot.log");
        if (!existsSync(logPath)) {
            output(opts, { lines: [] }, () => "(henüz log yok — otopilot hiç başlatılmamış)");
            return;
        }
        const allLines = readFileSync(logPath, "utf-8").split("\n").filter((l) => l.length > 0);
        const tail = allLines.slice(-opts.lines);
        output(opts, { lines: tail }, () => (tail.length > 0 ? tail.join("\n") : "(boş)"));
    }));
    withGraphRoot(autopilotCmd.command("run-loop-internal", { hidden: true }).description("DAHİLİ — 'gp autopilot start' tarafından alt süreç olarak çağrılır; elle çalıştırmayın"))
        .requiredOption("--agents-dir <path>", "agent tanım dosyalarının bulunduğu dizin")
        .action(asyncAction(async (opts) => {
        try {
            const graph = loadGraph(opts);
            const config = loadConfig(graph);
            const secrets = loadProjectSecrets(opts.graphRoot);
            if (!secrets)
                throw new Error("Telegram secrets bulunamadı (~/.graphpilot/secrets.json)");
            const client = new TelegramClient(secrets.telegramBotToken);
            // Faz 12.13 — ağ hataları süreci düşürmez, log'a yazılır (telegramClient hataları
            // token içermez — 12.9).
            const logNetworkError = (err) => console.error(`[${new Date().toISOString()}] telegram: ${err instanceof Error ? err.message : String(err)}`);
            const poller = new TelegramPoller(client, secrets.telegramChatId, logNetworkError);
            const notifier = new RetryingNotifier(new TelegramNotifier(client, secrets.telegramChatId, poller), logNetworkError);
            const result = await runAutopilotLoop({
                graphRootDir: opts.graphRoot,
                agentsDir: opts.agentsDir,
                notifier,
                poller,
                lang: config.autopilot.language,
            });
            output(opts, result, () => `bitti: ${result.stopReason} (işlenen: ${result.processedCount})`);
        }
        finally {
            removeLock(opts.graphRoot);
        }
    }));
    const teamCmd = program
        .command("team")
        .description("Roadmap Faz 13 — ekip modu: tag'e dayalı atama, escalation, karar günlüğü");
    withGraphRoot(teamCmd.command("assign").description("Bir görevin ekip atamasını gösterir (deterministik, 13.3)"))
        .argument("<id>", "task ID'si")
        .action(action((id, opts) => {
        const graph = loadGraph(opts);
        const config = loadConfig(graph);
        const node = graph.nodesById.get(id);
        if (!node)
            throw new Error(`düğüm bulunamadı: ${id}`);
        const assignment = resolveAssignment(node, config);
        output(opts, assignment, () => `${assignment.role} · model: ${assignment.model} · agent: ${assignment.agent}`);
    }));
    withGraphRoot(teamCmd
        .command("escalate")
        .description("Bir görevi ekip zincirinde yükseltir (junior(haiku)→junior(sonnet)→senior, 13.5)"))
        .argument("<id>", "task ID'si")
        .action(action((id, opts) => {
        const graph = loadGraph(opts);
        const config = loadConfig(graph);
        const result = escalateTeamNode(graph, id, config);
        output(opts, result, () => result.escalated
            ? `${result.fromRole}(${result.fromModel}) → ${result.toRole}(${result.toModel})`
            : `yükseltilmedi: ${result.reason}`);
    }));
    const decisionsCmd = teamCmd.command("decisions").description("Roadmap 13.11 — karar günlüğü");
    withGraphRoot(decisionsCmd.command("list").description("Tüm kayıtlı kararları listeler")).action(action((opts) => {
        const decisions = readDecisions(opts.graphRoot);
        output(opts, decisions, () => decisions.length === 0
            ? "(henüz karar yok)"
            : decisions
                .map((d) => `${d.overridden ? "✗" : "✓"} ${d.id} · ${d.nodeId} · ${d.summary} · ${d.decidedBy}`)
                .join("\n"));
    }));
    withGraphRoot(decisionsCmd
        .command("override")
        .description("Bir kararı geri çevirir, aynı feature'a bir düzeltme görevi açar (13.11)"))
        .argument("<decision-id>", "ör. E01-F01-T03-D1")
        .action(action((decisionId, opts) => {
        const graph = loadGraph(opts);
        const decision = findDecision(opts.graphRoot, decisionId);
        if (!decision)
            throw new Error(`karar bulunamadı: ${decisionId}`);
        markDecisionOverridden(opts.graphRoot, decisionId);
        const featureId = decision.nodeId.split("-").slice(0, 2).join("-");
        const slug = `override-${decisionId}`.toLowerCase().replace(/[^a-z0-9-]/g, "-");
        const result = createNewNode(graph, {
            kind: "task",
            slug,
            parent: featureId,
            summary: `Karar geri çevrildi (${decisionId}): düzeltme gerekiyor`.slice(0, 100),
        });
        output(opts, { decisionId, overridden: true, correctionTask: result.id }, () => `✓ ${decisionId} geri çevrildi. Düzeltme görevi: ${result.id}`);
    }));
    withGraphRoot(teamCmd.command("stats").description("Roadmap 13.13 — ekip ölçümleri (yanlış tag oranı, karar/geri çevirme sayısı)")).action(action((opts) => {
        const graph = loadGraph(opts);
        const status = computeStatusSummary(graph);
        const doneCount = status.byStatus.done ?? 0;
        const misTags = summarizeMisTags(opts.graphRoot);
        const misTagRatio = computeMisTagRatio(opts.graphRoot, doneCount);
        const decisions = readDecisions(opts.graphRoot);
        const overriddenCount = decisions.filter((d) => d.overridden).length;
        const stats = {
            doneTasks: doneCount,
            misTags,
            misTagRatio,
            decisionsTotal: decisions.length,
            overriddenCount,
            overrideRatio: decisions.length > 0 ? overriddenCount / decisions.length : 0,
        };
        output(opts, stats, () => [
            `bitmiş görev: ${doneCount}`,
            `yanlış tag: ${misTags.total} (${(misTagRatio * 100).toFixed(1)}%) — eksik tahmin: ${misTags.underestimated}, fazla tahmin: ${misTags.overestimated}`,
            `karar: ${decisions.length}, geri çevrilen: ${overriddenCount} (${(stats.overrideRatio * 100).toFixed(1)}%)`,
        ].join("\n"));
    }));
    /**
     * Roadmap 13.7/13.9 — `gp team finding`/`finding-answer` ikilisi `findingHandler.ts`'in
     * `handleFinding`/`askUserAndResolve`'una BİREBİR AYNI MANTIĞI uygular ama `Notifier`
     * (Telegram/otopilot, Faz 12) üzerinden DEĞİL — Mod A'nın ANA THREAD'i zaten
     * `AskUserQuestion`'a sahip (subagent'lar sahip değil), bu yüzden "soru sor" adımı
     * BURADA değil, SKILL'in (`/gp:team`) kendisinde. Bu komut sadece "soru metnini/
     * seçeneklerini üret" ve "gerekirse HİÇ SORMADAN kendisi çöz" kısımlarını yapar;
     * `finding-answer` cevabı UYGULAR. Bilinçli kod tekrarı (iki ayrı yürütme modeli,
     * zorla ortak bir soyutlamaya sıkıştırmak yerine).
     */
    withGraphRoot(teamCmd
        .command("finding")
        .description("Roadmap 13.7 — bir bulguyu bildirir. Bloklamıyorsa ya da yönetici kendisi " +
        "çözebiliyorsa HEMEN sonuçlanır; aksi halde soru metnini döner (Mod A: " +
        "AskUserQuestion ile sor, sonra 'gp team finding-answer' ile uygula)"))
        .argument("<id>", "task ID'si")
        .requiredOption("--finding <json>", "Finding JSON'u (kind/severity/summary/options/recommended)")
        .action(action((id, opts) => {
        const graph = loadGraph(opts);
        const config = loadConfig(graph);
        const node = graph.nodesById.get(id);
        if (!node)
            throw new Error(`düğüm bulunamadı: ${id}`);
        const finding = parseFinding(JSON.parse(opts.finding));
        const chosen = finding.options[finding.recommended];
        if (finding.severity === "non_blocking") {
            appendErrorHistoryLine(node.filePath, `${id} bulgu (bloklamayan, ${finding.kind}): ${finding.summary} → ${chosen}`);
            if (node.epicId) {
                recordDecision(graph, {
                    epicId: node.epicId,
                    nodeId: id,
                    summary: `${finding.summary} → ${chosen}`,
                    decidedBy: "manager",
                    optionsCount: finding.options.length,
                });
            }
            output(opts, { outcome: "proceeded_with_recommended", chosenOptionIndex: finding.recommended }, () => `✓ bloklamayan, önerilen uygulandı: ${chosen}`);
            return;
        }
        setFrontmatter(graph, id, { status: "needs_decision" });
        emitEvent(opts.graphRoot, { type: "needs_decision", nodeId: id, message: finding.summary, data: { finding } });
        appendErrorHistoryLine(node.filePath, `${id} bulgu (BLOKLAYAN, ${finding.kind}): ${finding.summary}`);
        const situation = FINDING_KIND_TO_SITUATION[finding.kind];
        const managerAction = decideManagerAction(situation, config.team.manager.autonomy);
        if (managerAction === "self") {
            setFrontmatter(graph, id, { status: "pending" });
            appendErrorHistoryLine(node.filePath, `${id} karar (yönetici): ${chosen}`);
            if (node.epicId) {
                recordDecision(graph, {
                    epicId: node.epicId,
                    nodeId: id,
                    summary: `${finding.summary} → ${chosen}`,
                    decidedBy: "manager",
                    optionsCount: finding.options.length,
                });
            }
            emitEvent(opts.graphRoot, { type: "decision_answered", nodeId: id, data: { decidedBy: "manager" } });
            output(opts, { outcome: "self_resolved", chosenOptionIndex: finding.recommended }, () => `✓ yönetici kendisi çözdü: ${chosen}`);
            return;
        }
        if (managerAction === "consult_senior") {
            output(opts, { outcome: "needs_senior_consultation", situation }, () => `senior'a danışılmalı (${situation}) — cevabı aldıktan sonra 'gp team finding-answer' çağır`);
            return;
        }
        const impact = computeFindingImpact(graph, id);
        const msg = decisionNeededMessage(config.autopilot.language, {
            nodeId: id,
            nodeTitle: node.name,
            situation: finding.summary,
            impactText: formatImpactText(config.autopilot.language, impact),
            recommendedOption: chosen,
            options: finding.options,
            recommendedIndex: finding.recommended,
        });
        output(opts, { outcome: "needs_user_decision", message: msg.text, options: finding.options }, () => `${msg.text}\n\n→ AskUserQuestion ile sor, cevabı 'gp team finding-answer ${id} --finding <json> --answer <index|stop>' ile uygula.`);
    }));
    withGraphRoot(teamCmd
        .command("finding-answer")
        .description("Roadmap 13.9 — AskUserQuestion'dan (ya da senior danışmasından) gelen cevabı uygular"))
        .argument("<id>", "task ID'si")
        .requiredOption("--finding <json>", "Aynı Finding JSON'u (seçenek metinlerini kaydetmek için)")
        .requiredOption("--answer <value>", "seçilen seçeneğin indeksi (0,1,2,...) ya da 'stop'")
        .option("--decided-by <who>", "karar veren", "user (ekran)")
        .action(action((id, opts) => {
        const graph = loadGraph(opts);
        const node = graph.nodesById.get(id);
        if (!node)
            throw new Error(`düğüm bulunamadı: ${id}`);
        const finding = parseFinding(JSON.parse(opts.finding));
        if (opts.answer === "stop") {
            setFrontmatter(graph, id, { status: "failed" });
            appendErrorHistoryLine(node.filePath, `${id} karar (${opts.decidedBy}): durduruldu`);
            if (node.epicId) {
                recordDecision(graph, {
                    epicId: node.epicId,
                    nodeId: id,
                    summary: `${finding.summary} → durduruldu`,
                    decidedBy: opts.decidedBy,
                    optionsCount: finding.options.length,
                });
            }
            emitEvent(opts.graphRoot, { type: "decision_answered", nodeId: id, data: { decidedBy: opts.decidedBy, stopped: true } });
            output(opts, { outcome: "stopped" }, () => "✓ durduruldu.");
            return;
        }
        const idx = Number(opts.answer);
        if (!Number.isInteger(idx) || idx < 0 || idx >= finding.options.length) {
            throw new Error(`geçersiz seçenek indeksi: ${opts.answer}`);
        }
        setFrontmatter(graph, id, { status: "pending" });
        appendErrorHistoryLine(node.filePath, `${id} karar (${opts.decidedBy}): ${finding.options[idx]}`);
        if (node.epicId) {
            recordDecision(graph, {
                epicId: node.epicId,
                nodeId: id,
                summary: `${finding.summary} → ${finding.options[idx]}`,
                decidedBy: opts.decidedBy,
                optionsCount: finding.options.length,
            });
        }
        emitEvent(opts.graphRoot, { type: "decision_answered", nodeId: id, data: { decidedBy: opts.decidedBy } });
        output(opts, { outcome: "user_chose", chosenOptionIndex: idx }, () => `✓ karar uygulandı: ${finding.options[idx]}`);
    }));
    program
        .command("agent-stats")
        .description("Faz 7.4: her agent .md'sinin tool-tanımı ve toplam token tahmini")
        .requiredOption("--agents-dir <path>", "agent tanım dosyalarının bulunduğu dizin")
        .option("--json", "makine-okur JSON çıktı")
        .action(action((opts) => {
        const stats = computeAgentStats(opts.agentsDir);
        output({ graphRoot: "", json: opts.json }, stats, () => stats
            .map((s) => `${s.name}: tools≈${s.toolDefTokens} token (${s.tools}${s.disallowedTools ? ` / yasak: ${s.disallowedTools}` : ""}), toplam≈${s.totalTokens} token`)
            .join("\n"));
    }));
    withGraphRoot(program
        .command("ablation")
        .description("Faz 7.10: her optimizasyon tekniği için gerçek, ölçülebilir bir satır üretir"))
        .requiredOption("--sample-task <id>", "gp context için örnek task ID'si")
        .requiredOption("--agents-dir <path>", "agent tanım dosyalarının bulunduğu dizin")
        .option("--out <path>", "markdown tablonun yazılacağı dosya (verilmezse stdout)")
        .action(action((opts) => {
        const graph = loadGraph(opts);
        const config = loadConfig(graph);
        const rows = computeAblationRows(graph, config, opts.sampleTask, opts.agentsDir, resolvePath(opts.projectRoot));
        const markdown = renderAblationMarkdown(rows);
        if (opts.out) {
            writeFileAtomic(opts.out, markdown);
        }
        output(opts, { rows }, () => (opts.out ? `✓ ${opts.out} yazıldı.` : markdown));
    }));
    const hookCmd = program
        .command("hook")
        .description("Plugin hook'ları (stdin JSON → stdout JSON) — bkz. plugin/hooks/hooks.json");
    hookCmd
        .command("trim-bash")
        .description("PostToolUse (matcher: Bash) — Faz 7.3/ADR-005: uzun çıktıyı son 50 satıra kırpar")
        .action(hookAction(() => {
        const input = readStdinJson();
        const cwd = input.cwd ?? process.cwd();
        const fast = loadFastConfig(cwd);
        const out = computeTrimmedBashOutput(input, {
            graphDirExists: fast.graphDirExists,
            logTrimmingEnabled: fast.optimizations.log_trimming,
        });
        process.stdout.write(JSON.stringify(out));
    }));
    hookCmd
        .command("run-guard")
        .description("UserPromptExpansion — Faz 15: /gp:run uzun bir oturumda yazılırsa önce /clear önerir")
        .action(hookAction(() => {
        const input = readStdinJson();
        const fast = loadFastConfig(input.cwd ?? process.cwd());
        const out = computeRunGuard(input, {
            graphDirExists: fast.graphDirExists,
            thresholdTokens: fast.efficiency.run_clear_warn_tokens,
            contextTokens: readContextTokens,
        });
        process.stdout.write(JSON.stringify(out));
    }));
    hookCmd
        .command("track-tool-use")
        .description("PreToolUse (matcher: Read|Glob|Grep|Write|Bash) — Faz 7.2/7.7/7.9: sayaç + döngü uyarısı")
        .action(hookAction(() => {
        const input = readStdinJson();
        const cwd = input.cwd ?? process.cwd();
        const fast = loadFastConfig(cwd);
        if (!fast.graphDirExists) {
            process.stdout.write("{}");
            return;
        }
        // Faz 7.2 "düğüm başına" ölçüm: `agent_id` (research.md'nin evrensel hook
        // alanlarından biri) her Agent tool çağrısına (= her coder/tester node'una) özel
        // olduğu VARSAYILIYOR — bu oturumda gerçek bir paralel subagent hook ateşlemesiyle
        // DOĞRULANMADI. Yoksa (ana thread'in kendi tool çağrıları) `session_id`'ye düşülür.
        const scopeId = input.agent_id ?? input.session_id ?? "unknown";
        const countersPath = join(cwd, ".graph", "_runtime", "hook-counters", `${scopeId}.json`);
        let counters = {};
        try {
            counters = JSON.parse(readFileSync(countersPath, "utf-8"));
        }
        catch {
            counters = {};
        }
        let fileExistsBeforeWrite;
        const writeTarget = input.tool_input?.file_path;
        if (input.tool_name === "Write" && typeof writeTarget === "string") {
            const abs = isAbsolute(writeTarget) ? writeTarget : join(cwd, writeTarget);
            fileExistsBeforeWrite = existsSync(abs);
        }
        const result = computeTrackToolUse(input, {
            graphDirExists: fast.graphDirExists,
            turnLimitsEnabled: fast.optimizations.turn_limits,
        }, counters, fileExistsBeforeWrite);
        writeFileAtomic(countersPath, JSON.stringify(result.updatedCounters));
        if (result.record) {
            appendMetric(join(cwd, ".graph"), "tool-use.jsonl", {
                ...result.record,
                scopeId,
                ts: new Date().toISOString(),
            });
        }
        // Faz 9.7 — "touches dışındaki dosyalara yazma tespiti → uyarı". `tool_input`'in
        // Edit tool'daki tam alan adı bu oturumda DOĞRULANMADI (araştırma Write'ı
        // doğruladı, Edit'i varsaymadı) — bu yüzden iki olası ad da denenir, hiçbiri
        // yoksa sessizce atlanır (tahmin edip yanlış davranmaktan iyidir).
        let output = result.output;
        if (input.tool_name === "Write" || input.tool_name === "Edit") {
            const target = input.tool_input?.file_path ?? input.tool_input?.filePath;
            if (typeof target === "string") {
                const relTarget = isAbsolute(target) ? relative(cwd, target) : target;
                const running = readRunningNodesTouches(join(cwd, ".graph"));
                const violation = checkTouchesViolation(relTarget, running);
                // Faz 7'nin optimizations.* bayraklarından KASITLI OLARAK bağımsız — bu bir
                // token-tasarruf tekniği değil, bir güvenlik uyarısı (9.7); kapatma anahtarı yok.
                if (violation) {
                    const prior = output.hookSpecificOutput?.additionalContext;
                    const warning = `⚠ GraphPilot: "${violation.path}" şu an çalışan düğümün/düğümlerin 'touches' deseninin DIŞINDA (${violation.checkedAgainst.map((n) => n.nodeId).join(", ")}) — kapsam dışına mı çıktın?`;
                    output = {
                        hookSpecificOutput: {
                            hookEventName: "PreToolUse",
                            additionalContext: prior ? `${prior}\n${warning}` : warning,
                        },
                    };
                }
            }
        }
        process.stdout.write(JSON.stringify(output));
    }));
    return program;
}
