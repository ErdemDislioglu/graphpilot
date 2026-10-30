import { join, relative } from "node:path";
import { closeSync, mkdirSync, openSync, rmSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { parseGraph } from "./graph/parser.js";
import { getDependsOn, tasksOf } from "./graph/types.js";
import { writeContextFile } from "./context.js";
import { resolveRoute } from "./route.js";
import { resolveTeamRoute } from "./team/assign.js";
import { setFrontmatter } from "./set.js";
import { applyRollup } from "./rollup.js";
import { generateEpicIndex, generateRootIndex } from "./indexGen.js";
import { writeFileAtomic } from "./atomicWrite.js";
import { computeEpicDone } from "./epicStatus.js";
import { writeRepoMap } from "./repomap.js";
import { validateGraph } from "./validate.js";
import { runChecks, runVerify } from "./checks.js";
import type { CommandRunner } from "./checks.js";
import { extractAcceptanceCriteria, readGitDiff, runAcceptanceCheck } from "./check.js";
import type { ClaudeSpawner, GitRunner } from "./check.js";
import { computeFixLoopStatus, markFixLoopReset, readCurrentAttemptRounds, recordFixLoopRound } from "./fixLoop.js";
import { computeNext, touchesConflict } from "./next.js";
import { matchesAnyTouches } from "./hooks/touchesGuard.js";
import { escalateNode } from "./escalate.js";
import { escalateTeamNode } from "./team/teamEscalate.js";
import { failNode } from "./fail.js";
import { findExpandCandidates } from "./expandCandidates.js";
import { checkoutBranch, epicBranchName, pushCurrentBranch } from "./autopilot/epicRun.js";
import { epicDoneMessage } from "./autopilot/messages.js";
import type { StatusChange } from "./rollup.js";
import type { Config } from "./schema/index.js";
import type { Graph, GraphNode } from "./graph/types.js";

const defaultGitRunner: GitRunner = (args, cwd) => {
  const result = spawnSync("git", args, { cwd, encoding: "utf-8" });
  return { stdout: result.stdout ?? "", status: result.error ? null : result.status };
};

/** `gp route` ile aynı kaynak (ekip modu açıksa team tablosu). */
export function routeFor(node: GraphNode, config: Config) {
  return config.team.enabled ? resolveTeamRoute(node, config) : resolveRoute(node, config);
}

/** Feature/epic roll-up'ı (Faz 14 B2) + INDEX.md ve tüm epic `_index.md`'leri. */
export function refreshGraphState(graphRoot: string): { rollup: StatusChange[]; epics: number } {
  const rollup = applyRollup(parseGraph(graphRoot));
  const graph = parseGraph(graphRoot);
  writeFileAtomic(join(graphRoot, "INDEX.md"), generateRootIndex(graph));
  const epicIds = [...graph.nodesById.values()].filter((n) => n.kind === "epic").map((n) => n.id);
  for (const epicId of epicIds) {
    const dir = graph.nodesById.get(epicId)!.filePath.replace(/\/epic\.md$/, "");
    writeFileAtomic(join(dir, "_index.md"), generateEpicIndex(graph, epicId));
  }
  return { rollup, epics: epicIds.length };
}

const MODEL_RANK = ["haiku", "sonnet", "opus", "fable"];
const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

/**
 * Faz 14 O16 — feature başına agent. `startId`'den başlayıp aynı feature'da, aynı
 * dosyalara dokunan (`touches` kesişimi), sırayla birbirine bağlı görevleri toplar:
 * pilotta aynı `store.js`'i 7 agent ayrı ayrı okumuştu. Ölçek koruması: yalnız
 * `low/med` complexity ve `risk` ≠ high, en fazla `efficiency.feature_agent_max_tasks`;
 * ardılı birden çoksa zincir durur (paralel işi tek agent'a yığmamak için).
 */
export function computeChain(graph: Graph, startId: string, config: Config): string[] {
  const start = graph.nodesById.get(startId);
  if (!start || !config.efficiency.feature_agent || !chainable(start)) return [startId];
  const featureId = startId.split("-").slice(0, 2).join("-");
  const chain = [start];
  const touched = new Set(strings(start.frontmatter.touches));

  while (chain.length < config.efficiency.feature_agent_max_tasks) {
    const last = chain[chain.length - 1];
    const inChain = new Set(chain.map((n) => n.id));
    const successors = tasksOf(graph).filter(
      (t) =>
        t.frontmatter.status === "pending" &&
        !inChain.has(t.id) &&
        getDependsOn(graph, t.id).some((d) => d.id === last.id),
    );
    if (successors.length !== 1) break;
    const next = successors[0];
    const depsMet = getDependsOn(graph, next.id).every(
      (d) => inChain.has(d.id) || d.frontmatter.status === "done",
    );
    const sharesFiles = strings(next.frontmatter.touches).some((t) => touched.has(t));
    if (!next.id.startsWith(`${featureId}-`) || !chainable(next) || !depsMet || !sharesFiles) break;
    chain.push(next);
    for (const t of strings(next.frontmatter.touches)) touched.add(t);
  }
  return chain.map((n) => n.id);
}

function chainable(node: GraphNode): boolean {
  const fm = node.frontmatter;
  return node.kind === "task" && fm.complexity !== "high" && fm.risk !== "high";
}

export interface StartedTask {
  id: string;
  agent: string;
  model: string;
  max_turns: number;
  type: string;
  contextPath: string;
  tokenEstimate: number;
  verify: string[];
}

export interface StartResult {
  tasks: StartedTask[];
  /** Birden çok görev tek agent'a verilecekse ortak çağrı: en güçlü model/rol, toplam tur. */
  group: { agent: string; model: string; max_turns: number };
  git: { repo: boolean; base: string | null };
}

/**
 * Faz 14 O5 — `gp start <id...>`: route + context + `status=running` tek komutta
 * (eskiden görev başına 3 ayrı çağrı + context dosyasını okuma). Context dosyasının
 * İÇERİĞİ değil YOLU döner (O6) — agent kendisi okur.
 */
export function startTasks(
  graphRoot: string,
  ids: string[],
  config: Config,
  opts: { projectRoot: string; git?: GitRunner },
): StartResult {
  const graph = parseGraph(graphRoot);
  const tasks: StartedTask[] = [];
  for (const id of ids) {
    const node = graph.nodesById.get(id);
    if (!node || node.kind !== "task") throw new Error(`task bulunamadı: ${id}`);
    const route = routeFor(node, config);
    const context = writeContextFile(graph, id, config);
    tasks.push({
      id,
      agent: route.agent,
      model: route.model,
      max_turns: route.max_turns,
      type: String(node.frontmatter.type ?? "feature"),
      contextPath: join(graphRoot, "_runtime", `${id}.context.md`),
      tokenEstimate: context.tokenEstimate,
      verify: strings(node.frontmatter.verify),
    });
  }
  for (const id of ids) {
    const result = setFrontmatter(parseGraph(graphRoot), id, { status: "running" });
    if (!result.ok) throw new Error(`${id}: ${result.errors.join("; ")}`);
  }

  const git = opts.git ?? defaultGitRunner;
  const inside = git(["rev-parse", "--is-inside-work-tree"], opts.projectRoot);
  const repo = inside.status === 0 && inside.stdout.trim() === "true";
  if (repo && config.workflow.branch_per_epic) switchToEpicBranch(graphRoot, ids, opts.projectRoot, git);
  const head = git(["rev-parse", "--verify", "--quiet", "HEAD"], opts.projectRoot);

  const rank = (m: string) => MODEL_RANK.indexOf(m);
  const model = tasks.map((t) => t.model).reduce((a, b) => (rank(b) > rank(a) ? b : a));
  const agent = tasks.some((t) => t.agent === "senior")
    ? "senior"
    : tasks.some((t) => t.agent === "coder")
      ? "coder"
      : tasks[0].agent;
  return {
    tasks,
    group: { agent, model, max_turns: tasks.reduce((sum, t) => sum + t.max_turns, 0) },
    git: { repo, base: repo && head.status === 0 ? head.stdout.trim() : null },
  };
}

export interface GateResult {
  id: string;
  round: number;
  issues: string[];
  /** Katman 2 çalıştı mı: `verify:` varsa gerekmez; git'siz modda çalışamaz. */
  layer2: "ran" | "skipped-verify" | "unavailable";
  /** Ne `verify:` ne Katman 2 — hiçbir görev düzeyi doğrulama yapılamadı (kullanıcıya bildir). */
  unverified: boolean;
  /** `fix` → eksik listesiyle agent'ı tekrar çağır; `done` → `gp finish`; `escalate` → hata politikası. */
  decision: "fix" | "done" | "escalate";
  reason: string;
}

/**
 * Faz 14 O5/O9 — `gp gate <id> --round N`: bir doğrulama turu tek komutta. Katman 1
 * (`checks` + görevin `verify:` komutları, sıfır token); Katman 1 temizse ve görevin
 * `verify:`'ı yoksa Katman 2 (`claude -p`, diff'e karşı kabul kriterleri). Git'siz modda
 * Katman 2 yapılamaz (B11) — eksik SAYILMAZ ama `unverified: true` döner. Turu kaydeder,
 * fix-loop frenlerini uygular, tek bir karar döner.
 */
export function gateTask(
  graphRoot: string,
  id: string,
  config: Config,
  opts: {
    projectRoot: string;
    round: number;
    runner?: CommandRunner;
    git?: GitRunner;
    spawner?: ClaudeSpawner;
  },
): GateResult {
  const graph = parseGraph(graphRoot);
  const node = graph.nodesById.get(id);
  if (!node || node.kind !== "task") throw new Error(`task bulunamadı: ${id}`);
  const trim = { trimOutput: config.optimizations.log_trimming };
  const verify = strings(node.frontmatter.verify);

  const issues: string[] = [];
  for (const r of runChecks(opts.projectRoot, config.checks, opts.runner, trim)) {
    if (!r.ok) issues.push(`[${r.name}] ${r.command}${r.output ? `\n${r.output}` : ""}`);
  }
  for (const r of runVerify(opts.projectRoot, verify, opts.runner, trim)) {
    if (!r.ok) issues.push(`[verify] ${r.command}${r.output ? `\n${r.output}` : ""}`);
  }

  let layer2: GateResult["layer2"] = verify.length > 0 ? "skipped-verify" : "unavailable";
  if (issues.length === 0 && verify.length === 0) {
    const criteria = extractAcceptanceCriteria(node);
    const diff = readGitDiff(opts.projectRoot, opts.git);
    if (criteria && diff.ok) {
      layer2 = "ran";
      const check = runAcceptanceCheck(criteria, diff.diff, {
        model: config.fix_loop.acceptance_check_model,
        spawner: opts.spawner,
      });
      // ADR-008: kontrol başarısızsa asla sessizce "ok" sayma.
      if (!check.success) issues.push(`[kabul] kontrol başarısız: ${check.error}`);
      for (const r of check.results) if (r.durum === "eksik") issues.push(`[kabul] ${r.kriter} — ${r.not}`);
    }
  }

  recordFixLoopRound(graphRoot, id, { round: opts.round, issuesCount: issues.length });
  const status = computeFixLoopStatus(readCurrentAttemptRounds(graphRoot, id), {
    maxRounds: config.fix_loop.max_rounds,
    nodeBudget: typeof node.frontmatter.context_budget === "number" ? node.frontmatter.context_budget : undefined,
    breakIfNoProgress: config.fix_loop.break_if_no_progress,
  });
  const decision = !status.shouldBreak ? "fix" : status.converged ? "done" : "escalate";
  return {
    id,
    round: opts.round,
    issues,
    layer2,
    unverified: verify.length === 0 && layer2 !== "ran",
    decision,
    reason: status.reason,
  };
}

export interface FinishResult {
  ok: boolean;
  /** `ok:false` ise: bu düğümün `gp validate` hataları (ör. Handoff yok) — düzeltip tekrar çağır. */
  errors: string[];
  rollup: StatusChange[];
  epicDone: boolean;
  repomap: boolean;
  committed: boolean;
  /** Başka bir `running` görevin dosyası olduğu için bu commit'e alınmayan değişiklikler. */
  left: string[];
  /** `workflow.push_on_epic_done` ile epic bitince push yapıldıysa true; denenmediyse null. */
  pushed: boolean | null;
}

/**
 * Faz 14 O5 — `gp finish <id>`: Handoff doğrulaması + `status=done` + roll-up + indeks +
 * epic bittiyse repo-map + kalıntı context dosyasını silme (B5) + git varsa WIP'leri tek
 * commit'e indirme (`gp(<id>): <summary>`). Eskiden görev başına 5–6 ayrı çağrıydı.
 */
export function finishTask(
  graphRoot: string,
  id: string,
  config: Config,
  opts: { projectRoot: string; base?: string; git?: GitRunner; siblings?: string[] },
): FinishResult {
  const graph = parseGraph(graphRoot);
  const node = graph.nodesById.get(id);
  if (!node || node.kind !== "task") throw new Error(`task bulunamadı: ${id}`);
  const fail = (errors: string[]): FinishResult => ({
    ok: false,
    errors,
    rollup: [],
    epicDone: false,
    repomap: false,
    committed: false,
    left: [],
    pushed: null,
  });

  // Son `gp gate` turu eksik bildirdiyse bitirilmez (duman testinde `fix` kararı yok
  // sayılıp `finish` çağrıldığında görev done oluyordu). Hiç tur yoksa engel yok.
  const lastRound = readCurrentAttemptRounds(graphRoot, id).at(-1);
  if (lastRound && lastRound.issuesCount > 0) {
    return fail([`son doğrulama turu (${lastRound.round}) ${lastRound.issuesCount} eksikle bitti — önce gp gate temiz geçmeli`]);
  }

  const done = setFrontmatter(graph, id, { status: "done" });
  if (!done.ok) return fail(done.errors);
  const errors = validateGraph(parseGraph(graphRoot))
    .filter((i) => i.severity === "error" && i.nodeId === id)
    .map((i) => i.message);
  if (errors.length > 0) {
    setFrontmatter(parseGraph(graphRoot), id, { status: "running" });
    return fail(errors);
  }

  const { rollup } = refreshGraphState(graphRoot);
  const epicDone = node.epicId ? computeEpicDone(parseGraph(graphRoot), node.epicId).done : false;
  const repomap = epicDone && config.optimizations.repo_map;
  if (repomap) writeRepoMap(opts.projectRoot, graphRoot);
  rmSync(join(graphRoot, "_runtime", `${id}.context.md`), { force: true });

  const git = opts.git ?? defaultGitRunner;
  const { committed, left } = commitTask(graphRoot, id, { ...opts, git });
  const pushed =
    epicDone && config.workflow.push_on_epic_done && committed ? pushCurrentBranch(opts.projectRoot, git) : null;
  return { ok: true, errors: [], rollup, epicDone, repomap, committed, left, pushed };
}

/** `git status --porcelain=v1 -z` çıktısındaki yollar (yeniden adlandırmada iki yol da). */
export function parsePorcelainZ(out: string): string[] {
  const parts = out.split("\0").filter(Boolean);
  const paths: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const code = parts[i].slice(0, 2);
    paths.push(parts[i].slice(3));
    if (code.includes("R") || code.includes("C")) paths.push(parts[++i]);
  }
  return paths;
}

/**
 * Faz 15 — paralel görevlerde commit karışması. Eskiden `reset --soft <base>` + `add -A`:
 * önce biten görev diğerinin yarım dosyalarını kendi commit'ine alıyor, sonra biten görev
 * `reset --soft` ile öncekinin commit'ini yutuyordu. Artık (1) `base..HEAD`'deki commit'lerin
 * HEPSİ bu görevin `gp-wip`'iyse squash edilir; (2) başka `running` görev varsa onun
 * `touches`'ına ve düğüm dosyasına uyan değişiklikler bu commit'e alınmaz (`left`).
 * `siblings`: aynı agent'ın zincirdeki diğer görevleri — "başka görev" sayılmaz.
 */
export function commitTask(
  graphRoot: string,
  id: string,
  opts: { projectRoot: string; base?: string; git: GitRunner; siblings?: string[] },
): { committed: boolean; left: string[] } {
  const { git, projectRoot } = opts;
  const inside = git(["rev-parse", "--is-inside-work-tree"], projectRoot);
  if (inside.status !== 0 || inside.stdout.trim() !== "true") return { committed: false, left: [] };

  if (opts.base) {
    const log = git(["log", "--format=%s", `${opts.base}..HEAD`], projectRoot);
    const subjects = log.stdout.split("\n").filter(Boolean);
    if (log.status === 0 && subjects.every((s) => s.startsWith(`gp-wip(${id})`))) {
      git(["reset", "--soft", opts.base], projectRoot);
    }
  }

  const graph = parseGraph(graphRoot);
  const own = new Set([id, ...(opts.siblings ?? [])]);
  const foreign = tasksOf(graph)
    .filter((t) => t.frontmatter.status === "running" && !own.has(t.id))
    .flatMap((t) => [...strings(t.frontmatter.touches), relative(projectRoot, t.filePath)]);
  let left: string[] = [];
  if (foreign.length === 0) {
    git(["add", "-A"], projectRoot);
  } else {
    const prefix = git(["rev-parse", "--show-prefix"], projectRoot).stdout.trim();
    const changed = parsePorcelainZ(
      git(["status", "--porcelain=v1", "-z", "--untracked-files=all"], projectRoot).stdout,
    )
      .filter((p) => p.startsWith(prefix))
      .map((p) => p.slice(prefix.length));
    left = changed.filter((p) => matchesAnyTouches(p, foreign));
    const mine = changed.filter((p) => !matchesAnyTouches(p, foreign));
    if (mine.length > 0) git(["add", "-A", "--", ...mine], projectRoot);
  }

  if (git(["diff", "--cached", "--quiet"], projectRoot).status !== 1) return { committed: false, left };
  const summary = String(graph.nodesById.get(id)?.frontmatter.summary ?? "");
  return { committed: git(["commit", "-q", "-m", `gp(${id}): ${summary}`], projectRoot).status === 0, left };
}

/**
 * Faz 15 — `workflow.branch_per_epic`: epic'in ilk görevi başlarken `feature/<epic>` dalına
 * geçer. Başka bir görev `running` iken dal DEĞİŞTİRİLMEZ (aynı çalışma ağacındaki diğer
 * agent'ın dosyaları altından kayar) — o durumda mevcut dalda devam edilir.
 */
function switchToEpicBranch(graphRoot: string, ids: string[], projectRoot: string, git: GitRunner): void {
  const graph = parseGraph(graphRoot);
  const epicId = graph.nodesById.get(ids[0])?.epicId;
  const epic = epicId ? graph.nodesById.get(epicId) : undefined;
  if (!epic) return;
  const othersRunning = tasksOf(graph).some((t) => t.frontmatter.status === "running" && !ids.includes(t.id));
  if (!othersRunning) checkoutBranch(projectRoot, epicBranchName(epic), git);
}

export interface CompleteResult {
  done: { id: string; committed: boolean; unverified: boolean }[];
  /** Eksik var — aynı agent YALNIZ bu listeyi düzeltip `gp complete`'i tekrar çağırır. */
  fix: { id: string; round: number; issues: string[] }[];
  /** Üst model/role yükseltildi, kuyruğa (`pending`) geri kondu — uygun worker alır. */
  requeued: { id: string; agent: string; model: string }[];
  /** Yükseltme zincirinin sonu — `failed`; kullanıcıya bitirme özetinde sorulur. */
  failed: { id: string; reason: string }[];
  /** `finish` reddetti (ör. Handoff yok) — agent düzeltip tekrar çağırır. */
  errors: { id: string; errors: string[] }[];
  epicsDone: string[];
  /** Başka görevin dosyası olduğu için commit'e alınmayanlar (bilgi amaçlı). */
  left: string[];
}

/**
 * Faz 15 — `gp complete <id...>`: her görev için doğrulama turu (`gate`, tur numarası
 * otomatik) + geçtiyse `finish` + yakınsamadıysa yükseltme/kuyruğa geri koyma ya da
 * `fail`. Eskiden agent dönüşü başına ana thread 2–3 ayrı komut ve karar turu atıyordu;
 * şimdi bunu worker'ın kendisi tek komutla yapar. Verilen ID'ler birbirinin "siblings"idir
 * (zincir) — birbirinin dosyasını `left`'e itmez.
 */
export function completeTasks(
  graphRoot: string,
  ids: string[],
  config: Config,
  opts: { projectRoot: string; runner?: CommandRunner; git?: GitRunner; spawner?: ClaudeSpawner },
): CompleteResult {
  const result: CompleteResult = { done: [], fix: [], requeued: [], failed: [], errors: [], epicsDone: [], left: [] };
  for (const id of ids) {
    const node = parseGraph(graphRoot).nodesById.get(id);
    if (!node || node.kind !== "task") throw new Error(`task bulunamadı: ${id}`);
    if (node.frontmatter.status !== "running") {
      result.errors.push({ id, errors: [`durum '${String(node.frontmatter.status)}', running değil`] });
      continue;
    }
    const round = (readCurrentAttemptRounds(graphRoot, id).at(-1)?.round ?? 0) + 1;
    const gate = gateTask(graphRoot, id, config, { ...opts, round });

    if (gate.decision === "fix") {
      result.fix.push({ id, round, issues: gate.issues });
    } else if (gate.decision === "done") {
      const fin = finishTask(graphRoot, id, config, { ...opts, siblings: ids });
      if (!fin.ok) {
        result.errors.push({ id, errors: fin.errors });
        continue;
      }
      result.done.push({ id, committed: fin.committed, unverified: gate.unverified });
      result.left.push(...fin.left.filter((p) => !result.left.includes(p)));
      if (fin.epicDone && node.epicId && !result.epicsDone.includes(node.epicId)) result.epicsDone.push(node.epicId);
    } else {
      const graph = parseGraph(graphRoot);
      const esc = config.team.enabled ? escalateTeamNode(graph, id, config) : escalateNode(graph, id, config);
      if (esc.escalated) {
        markFixLoopReset(graphRoot, id);
        setFrontmatter(parseGraph(graphRoot), id, { status: "pending" });
        const route = routeFor(parseGraph(graphRoot).nodesById.get(id)!, config);
        result.requeued.push({ id, agent: route.agent, model: route.model });
      } else {
        const reason = `${gate.reason}; ${esc.reason ?? "yükseltilemedi"}`;
        failNode(parseGraph(graphRoot), id, reason);
        result.failed.push({ id, reason });
      }
    }
  }
  return result;
}

const CLAIM_LOCK_STALE_MS = 30_000;

/**
 * `gp claim` aynı anda birden çok worker'dan çağrılır: `_runtime/claim.lock` O_EXCL ile
 * alınır (iki worker aynı görevi almasın). 30 sn'den eski kilit ölü sayılır.
 */
export function withClaimLock<T>(graphRoot: string, fn: () => T, opts: { timeoutMs?: number } = {}): T {
  const dir = join(graphRoot, "_runtime");
  mkdirSync(dir, { recursive: true });
  const lock = join(dir, "claim.lock");
  const deadline = Date.now() + (opts.timeoutMs ?? 10_000);
  for (;;) {
    try {
      closeSync(openSync(lock, "wx"));
      break;
    } catch {
      try {
        if (Date.now() - statSync(lock).mtimeMs > CLAIM_LOCK_STALE_MS) rmSync(lock, { force: true });
      } catch {
        // kilit bu arada kalktı — tekrar dene
      }
      if (Date.now() > deadline) throw new Error("claim kilidi alınamadı (başka bir gp claim takılı olabilir)");
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
    }
  }
  try {
    return fn();
  } finally {
    rmSync(lock, { force: true });
  }
}

export interface ClaimResult {
  /** `null` → bu worker'a uygun, şu an başlatılabilir görev yok; worker çıkar. */
  claimed: StartResult | null;
  /** Bu rol/model için bekleyen ama bağımlılığı ya da dosya çakışması yüzünden henüz başlatılamayan görev sayısı. */
  waiting: number;
}

/**
 * Faz 15 — worker modu: `gp claim --agent <a> --model <m>`. Hazır görevlerden rotası
 * (`gp route`/ekip ataması) bu worker'a düşen, `running` görevlerle dosya (`touches`)
 * çakışması olmayan ilkini (feature_agent açıksa zinciriyle) `gp start` eder.
 */
export function claimTasks(
  graphRoot: string,
  config: Config,
  opts: { agent: string; model: string; projectRoot: string; git?: GitRunner },
): ClaimResult {
  return withClaimLock(graphRoot, () => {
    const graph = parseGraph(graphRoot);
    const mine = (n: GraphNode) => {
      const r = routeFor(n, config);
      return r.agent === opts.agent && r.model === opts.model;
    };
    const busy = tasksOf(graph)
      .filter((t) => t.frontmatter.status === "running")
      .map((t) => strings(t.frontmatter.touches));
    const ready = computeNext(graph).ready.filter(mine);
    const pick = ready.find((n) => !busy.some((b) => touchesConflict(strings(n.frontmatter.touches), b)));
    const waiting = tasksOf(graph).filter((t) => t.frontmatter.status === "pending" && mine(t)).length - (pick ? 1 : 0);
    if (!pick) return { claimed: null, waiting };
    const ids = computeChain(graph, pick.id, config).filter((id) => mine(graph.nodesById.get(id)!));
    return { claimed: startTasks(graphRoot, ids, config, opts), waiting: waiting - (ids.length - 1) };
  });
}

export interface WorkerSlot {
  agent: string;
  model: string;
  /** Şu an başlatılabilir (hazır + çakışmasız) görev sayısı. */
  ready: number;
}

export interface WorkerPlan {
  /** Başlatılacak worker'lar — en fazla `parallelism` kadar, rol/model başına bir tane. */
  launch: WorkerSlot[];
  running: number;
  expand: string[];
  /** Hiç hazır/çalışan görev ve genişletme adayı kalmadı. */
  finished: boolean;
}

/**
 * Faz 15 — `gp workers`: ana thread'in tek kararı. Hazır görevleri rotaya göre gruplar;
 * çalışan görev sayısı `parallelism`'i dolduruyorsa yeni worker önermez. Worker'lar
 * kendi rotalarındaki işi `gp claim` ile çeker, ana thread görev görmez.
 */
export function planWorkers(graphRoot: string, config: Config): WorkerPlan {
  const graph = parseGraph(graphRoot);
  const running = tasksOf(graph).filter((t) => t.frontmatter.status === "running").length;
  const slots = new Map<string, WorkerSlot>();
  for (const node of computeNext(graph).ready) {
    const r = routeFor(node, config);
    const key = `${r.agent}/${r.model}`;
    const slot = slots.get(key) ?? { agent: r.agent, model: r.model, ready: 0 };
    slot.ready += 1;
    slots.set(key, slot);
  }
  const free = Math.max(0, config.parallelism - running);
  const launch = [...slots.values()].sort((a, b) => b.ready - a.ready).slice(0, free);
  const expand = findExpandCandidates(graph).map((c) => c.id);
  return { launch, running, expand, finished: slots.size === 0 && running === 0 && expand.length === 0 };
}

/**
 * Faz 15 — `workflow.notify_epic_done`: Mod A'da epic bitince Telegram'a kısa özet. Ağ hatası
 * görevi bozmaz (bildirim yan iş) — gönderilemeyen sayısı döner. `send` testte sahte.
 */
export async function notifyEpicsDone(
  graphRoot: string,
  epicIds: string[],
  config: Config,
  send: (text: string) => Promise<unknown>,
): Promise<{ sent: number; failed: number }> {
  const graph = parseGraph(graphRoot);
  let sent = 0;
  let failed = 0;
  for (const epicId of epicIds) {
    const epic = graph.nodesById.get(epicId);
    const text = epicDoneMessage(config.autopilot.language, {
      epicId,
      epicTitle: epic?.name ?? epicId,
      taskCount: tasksOf(graph).filter((t) => t.epicId === epicId).length,
      tokens: 0,
    }).text;
    try {
      await send(text);
      sent += 1;
    } catch {
      failed += 1;
    }
  }
  return { sent, failed };
}
