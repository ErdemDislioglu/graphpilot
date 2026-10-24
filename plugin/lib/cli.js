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
import { runChecks } from "./checks.js";
import { extractAcceptanceCriteria, runAcceptanceCheck } from "./check.js";
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
import { appendMetric } from "./metrics.js";
import { decideRunningNodeRecovery, findOrphanWipCommits } from "./recover.js";
import { computeDeadlockReport } from "./deadlock.js";
import { checkTouchesViolation, readRunningNodesTouches } from "./hooks/touchesGuard.js";
import { computeAllKnowledgeSyncReports, defaultFileHashReader, setKnowledgeSourceHashes, } from "./sourceHash.js";
import { readAgentDefinition } from "./agentFile.js";
import { runNodeHeadlessWithRetry } from "./runModeB.js";
import { writeFileAtomic } from "./atomicWrite.js";
import { existsSync, readFileSync } from "node:fs";
import { ConfigSchema } from "./schema/index.js";
import { isAbsolute, join, relative, resolve as resolvePath } from "node:path";
import { execSync } from "node:child_process";
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
    function withGraphRoot(cmd) {
        return cmd
            .option("-g, --graph-root <path>", "graph kök dizini", "./.graph")
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
        const graph = loadGraph(opts);
        writeFileAtomic(join(opts.graphRoot, "INDEX.md"), generateRootIndex(graph));
        const epicIds = [...graph.nodesById.values()]
            .filter((n) => n.kind === "epic")
            .map((n) => n.id);
        for (const epicId of epicIds) {
            const epic = graph.nodesById.get(epicId);
            const dir = epic.filePath.replace(/\/epic\.md$/, "");
            writeFileAtomic(join(dir, "_index.md"), generateEpicIndex(graph, epicId));
        }
        output(opts, { epics: epicIds.length }, () => `✓ INDEX.md + ${epicIds.length} epic _index.md üretildi.`);
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
        output(opts, { ok: true }, () => `✓ ${id} güncellendi.`);
    }));
    withGraphRoot(program.command("route").description("Bir task için model/agent/budget çözümle"))
        .argument("<id>", "task ID'si")
        .action(action((id, opts) => {
        const graph = loadGraph(opts);
        const config = loadConfig(graph);
        const node = graph.nodesById.get(id);
        if (!node)
            throw new Error(`düğüm bulunamadı: ${id}`);
        const result = resolveRoute(node, config);
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
        .option("-p, --project-root <path>", "iskelet komutunun çalıştığı kök", ".")
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
    withGraphRoot(program.command("new").description("Yeni düğüm iskeleti oluştur (format hatası olmaz)"))
        .argument("<kind>", "epic | feature | task | knowledge")
        .requiredOption("--slug <slug>", "kebab-case slug")
        .option("--parent <id>", "epic/feature ID'si (feature/task/epic-knowledge için zorunlu)")
        .option("--summary <text>", "tek satır özet")
        .option("--shared", "knowledge için: _shared/knowledge/ altına yaz")
        .option("--depends-on <ids>", "virgülle ayrılmış ID listesi (aynı türden, zaten var olmalı)")
        .option("--reads <names>", "sadece task: virgülle ayrılmış knowledge adı listesi (zaten var olmalı)")
        .option("--touches <globs>", "sadece task: virgülle ayrılmış glob deseni listesi")
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
        .option("-p, --project-root <path>", "git komutlarının çalıştığı kök", ".")
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
        .option("-p, --project-root <path>", "source_files'ın göreli olduğu kök", ".")
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
        .option("-p, --project-root <path>", "proje kökü", ".")
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
        .command("check")
        .description("Katman 2 (ADR-008): kabul kriterlerini diff'e karşı kontrol eder"))
        .argument("<id>", "task ID'si")
        .option("-p, --project-root <path>", "git diff'in çalıştığı kök", ".")
        .action(action((id, opts) => {
        const graph = loadGraph(opts);
        const config = loadConfig(graph);
        const node = graph.nodesById.get(id);
        if (!node)
            throw new Error(`düğüm bulunamadı: ${id}`);
        const criteria = extractAcceptanceCriteria(node);
        if (!criteria)
            throw new Error(`${id}: '## Kabul kriterleri' bölümü yok`);
        const diff = execSync("git diff HEAD", { cwd: opts.projectRoot, encoding: "utf-8" });
        const result = runAcceptanceCheck(criteria, diff, {
            model: config.fix_loop.acceptance_check_model,
        });
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
        .option("-p, --project-root <path>", "proje kökü (git/çalışma dizini)", ".")
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
        .option("-p, --project-root <path>", "repo-map için taranacak kök", ".")
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
