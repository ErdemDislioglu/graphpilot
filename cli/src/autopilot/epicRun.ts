import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { readAgentDefinition } from "../agentFile.js";
import type { GitRunner } from "../check.js";
import { computeEpicDone } from "../epicStatus.js";
import { findExpandCandidates, type ExpandCandidate } from "../expandCandidates.js";
import { runNodeHeadless, type ClaudeHeadlessSpawner } from "../runModeB.js";
import type { Config } from "../schema/index.js";
import type { Graph, GraphNode } from "../graph/types.js";
import type { Lang } from "./messages.js";

/**
 * Faz 12.13 (pilot isteği) — Telegram'dan `/run <EPIC>` ile bir epic başlatmak.
 * Otopilot önceden yalnız var olan task'ları koşturuyordu: epic genişletmiyor, kapsamı
 * (`autopilot.scope`) uygulamıyor, commit atmıyor ve iş bitince kapanıyordu. Bu dosya o
 * eksikleri kapatan, döngüden bağımsız test edilebilen parçaları toplar.
 */

const defaultGitRunner: GitRunner = (args, cwd) => {
  const result = spawnSync("git", args, { cwd, encoding: "utf-8" });
  return { stdout: result.stdout ?? "", status: result.error ? null : result.status };
};

/** `autopilot.scope` ("all" | "epic:E03" | "until:E05") bir düğümü kapsıyor mu. */
export function inScope(node: GraphNode, scope: string): boolean {
  if (scope === "all") return true;
  const [kind, target] = scope.split(":");
  const epicId = node.kind === "epic" ? node.id : node.epicId;
  if (!epicId || !target) return false;
  if (kind === "epic") return epicId === target;
  if (kind === "until") return epicId.localeCompare(target, undefined, { numeric: true }) <= 0;
  return false;
}

/** Kapsamdaki ilk genişletme adayı (feature'lar önce — `findExpandCandidates` sırası). */
export function expandCandidateInScope(graph: Graph, scope: string): ExpandCandidate | undefined {
  return findExpandCandidates(graph).find((c) => {
    const node = graph.nodesById.get(c.id);
    return node !== undefined && inScope(node, scope);
  });
}

/** Kapsamdaki tüm epic'ler bitti mi (genişletilmemiş epic/feature "bitmedi" sayılır). */
export function scopeDone(graph: Graph, scope: string): boolean {
  const epics = [...graph.nodesById.values()].filter((n) => n.kind === "epic" && inScope(n, scope));
  return epics.length > 0 && epics.every((e) => computeEpicDone(graph, e.id).done);
}

export type RunTarget = { ok: true; epic: GraphNode } | { ok: false; error: string };

/** `/run e03` argümanını doğrular: var olan, bitmemiş bir epic olmalı. */
export function parseRunTarget(graph: Graph, arg: string, lang: Lang): RunTarget {
  const id = arg.trim().split(/\s+/)[0]?.toUpperCase() ?? "";
  if (!id) return { ok: false, error: lang === "tr" ? "Kullanım: /run E03" : "Usage: /run E03" };
  const epic = graph.nodesById.get(id);
  if (!epic || epic.kind !== "epic") {
    return {
      ok: false,
      error:
        lang === "tr"
          ? `Epic bulunamadı: ${id} (liste: /epics)`
          : `No such epic: ${id} (see /epics)`,
    };
  }
  if (computeEpicDone(graph, id).done) {
    return {
      ok: false,
      error: lang === "tr" ? `${id} zaten tamamlandı.` : `${id} is already done.`,
    };
  }
  return { ok: true, epic };
}

/** `/epics` cevabı: her epic için durum işareti, bitmiş/toplam görev ve özet. */
export function epicsListText(graph: Graph, lang: Lang): string {
  const epics = [...graph.nodesById.values()]
    .filter((n) => n.kind === "epic")
    .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  if (epics.length === 0) return lang === "tr" ? "(epic yok)" : "(no epics)";
  const lines = epics.map((e) => {
    const s = computeEpicDone(graph, e.id);
    const mark = s.done ? "✅" : s.doneCount > 0 ? "⏳" : "▫️";
    const count = s.total > 0 ? ` (${s.doneCount}/${s.total})` : "";
    return `${mark} ${e.id}${count} — ${String(e.frontmatter.summary ?? e.name)}`;
  });
  return (lang === "tr" ? "📚 Epic'ler:\n" : "📚 Epics:\n") + lines.join("\n");
}

export function helpText(lang: Lang): string {
  return lang === "tr"
    ? [
        "🤖 Komutlar:",
        "/run E03 — epic'i görevlere böl ve çalıştır",
        "/epics — epic listesi ve durumu",
        "/status · /report — ilerleme",
        "/questions — bekleyen kararlar",
        "/pause · /resume · /stop",
      ].join("\n")
    : [
        "🤖 Commands:",
        "/run E03 — expand and run an epic",
        "/epics — epic list and status",
        "/status · /report — progress",
        "/questions — pending decisions",
        "/pause · /resume · /stop",
      ].join("\n");
}

/** `/gp:run`'ın §Genişletme adımının headless karşılığı: planner'a verilen görev mesajı. */
export function expansionPrompt(
  candidate: ExpandCandidate,
  config: Config,
  pluginRoot: string,
): string {
  const mode = candidate.kind === "epic" ? "GENİŞLETME-FEATURE" : "GENİŞLETME-TASK";
  return [
    `MOD: ${mode}`,
    `Hedef: ${candidate.id}`,
    `efficiency: ${JSON.stringify(config.efficiency)}`,
    `gp = node "${join(pluginRoot, "lib", "bin.js")}"`,
    "Girdileri (brief, hedef düğüm, ilgili bilgi düğümleri) `.graph/`'tan kendin oku.",
    "Sonucu `gp apply` ile yaz, `gp validate` temiz olsun, kısa JSON dön.",
  ].join("\n");
}

export interface ExpandResult {
  ok: boolean;
  error?: string;
}

/**
 * Bir adayı headless planner ile genişletir. `agentsDir` plugin'in `agents/` dizinidir;
 * planner `gp`'yi bulsun diye plugin kökü hem prompt'ta hem `CLAUDE_PLUGIN_ROOT`'ta verilir.
 */
export function expandHeadless(
  candidate: ExpandCandidate,
  opts: { agentsDir: string; config: Config; spawner?: ClaudeHeadlessSpawner },
): ExpandResult {
  const pluginRoot = dirname(opts.agentsDir);
  process.env.CLAUDE_PLUGIN_ROOT ??= pluginRoot;
  const planner = readAgentDefinition(join(opts.agentsDir, "planner.md"));
  const result = runNodeHeadless(
    expansionPrompt(candidate, opts.config, pluginRoot),
    planner,
    { model: opts.config.efficiency.expansion_model, max_turns: opts.config.budgets.max_turns },
    opts.spawner,
  );
  return result.ok
    ? { ok: true }
    : { ok: false, error: `claude -p başarısız (çıkış ${result.status})` };
}

/** `feature/E03-el-cizimi-tasarim-sistemi` — epic'in `name`'i zaten ID ile başlıyorsa tekrar etmez. */
export function epicBranchName(epic: GraphNode): string {
  const slug = epic.name.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return `feature/${slug.startsWith(epic.id) ? slug : `${epic.id}-${slug}`}`;
}

function isGitRepo(projectRoot: string, git: GitRunner): boolean {
  const inside = git(["rev-parse", "--is-inside-work-tree"], projectRoot);
  return inside.status === 0 && inside.stdout.trim() === "true";
}

/** Değişiklik varsa hepsini tek commit'e koyar; commit atıldıysa `true`. */
export function commitAll(
  projectRoot: string,
  message: string,
  git: GitRunner = defaultGitRunner,
): boolean {
  if (!isGitRepo(projectRoot, git)) return false;
  git(["add", "-A"], projectRoot);
  if (git(["diff", "--cached", "--quiet"], projectRoot).status !== 1) return false;
  return git(["commit", "-q", "-m", message], projectRoot).status === 0;
}

/** Dala geçer, yoksa mevcut HEAD'den açar. Commit'lenmemiş değişiklikler yeni dala taşınır. */
export function checkoutBranch(
  projectRoot: string,
  branch: string,
  git: GitRunner = defaultGitRunner,
): boolean {
  if (!isGitRepo(projectRoot, git)) return false;
  if (git(["rev-parse", "--abbrev-ref", "HEAD"], projectRoot).stdout.trim() === branch) return true;
  if (git(["checkout", "-q", branch], projectRoot).status === 0) return true;
  return git(["checkout", "-q", "-b", branch], projectRoot).status === 0;
}

/** Geçerli dalı `origin`'e push'lar (upstream'i de ayarlar). */
export function pushCurrentBranch(projectRoot: string, git: GitRunner = defaultGitRunner): boolean {
  if (!isGitRepo(projectRoot, git)) return false;
  return git(["push", "-q", "-u", "origin", "HEAD"], projectRoot).status === 0;
}
