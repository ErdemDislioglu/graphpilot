import { join } from "node:path";
import { rmSync } from "node:fs";
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
import { computeFixLoopStatus, readFixLoopRounds, recordFixLoopRound } from "./fixLoop.js";
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
  const head = git(["rev-parse", "--verify", "--quiet", "HEAD"], opts.projectRoot);
  const inside = git(["rev-parse", "--is-inside-work-tree"], opts.projectRoot);
  const repo = inside.status === 0 && inside.stdout.trim() === "true";

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
  const status = computeFixLoopStatus(readFixLoopRounds(graphRoot, id), {
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
  opts: { projectRoot: string; base?: string; git?: GitRunner },
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
  });

  // Son `gp gate` turu eksik bildirdiyse bitirilmez (duman testinde `fix` kararı yok
  // sayılıp `finish` çağrıldığında görev done oluyordu). Hiç tur yoksa engel yok.
  const lastRound = readFixLoopRounds(graphRoot, id).at(-1);
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
  let committed = false;
  const inside = git(["rev-parse", "--is-inside-work-tree"], opts.projectRoot);
  if (inside.status === 0 && inside.stdout.trim() === "true") {
    if (opts.base) git(["reset", "--soft", opts.base], opts.projectRoot);
    git(["add", "-A"], opts.projectRoot);
    const staged = git(["diff", "--cached", "--quiet"], opts.projectRoot);
    if (staged.status === 1) {
      const summary = String(node.frontmatter.summary ?? "");
      committed = git(["commit", "-q", "-m", `gp(${id}): ${summary}`], opts.projectRoot).status === 0;
    }
  }
  return { ok: true, errors: [], rollup, epicDone, repomap, committed };
}
