import { execSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseGraph } from "../graph/parser.js";
import { computeNext } from "../next.js";
import { resolveRoute } from "../route.js";
import { setFrontmatter } from "../set.js";
import { runChecks } from "../checks.js";
import { runAcceptanceCheck, extractAcceptanceCriteria } from "../check.js";
import { recordFixLoopRound, computeFixLoopStatus } from "../fixLoop.js";
import { escalateNode } from "../escalate.js";
import { failNode } from "../fail.js";
import { validateGraph } from "../validate.js";
import { ConfigSchema } from "../schema/index.js";

/**
 * Roadmap 9.6 — "sahte (mock) agent ile tam döngü testi: LLM çağırmadan durum
 * makinesini test eder". Faz 6'da bu akış ELLE (bir gerçek git deposunda, komut
 * komut) kanıtlanmıştı (bkz. faz-06 Faz Günlüğü) ama KALICI bir otomatik test olarak
 * YAZILMAMIŞTI. Bu dosya, `/gp:run`'ın SKILL.md algoritmasının gerçek `gp`
 * fonksiyonlarıyla (hiçbiri mock değil — SADECE "ajan kod yazdı" ve "claude -p"
 * adımları simüle edilir) birleştirilmiş hali.
 */

const CONFIG_YML = `
routing:
  - when: { complexity: low }
    model: haiku
escalation: [haiku, sonnet, opus]
max_attempts_per_model: 1
budgets: { default_context: 8000, max_turns: 25 }
fix_loop: { enabled: true, max_rounds: 2, acceptance_check_model: haiku, break_if_no_progress: true }
`;

const TASK_MD = (id: string, dependsOn: string[] = []) => `---
id: ${id}
kind: task
name: ${id}
level: 3
summary: s
type: feature
complexity: low
risk: low
context_size: small
model: auto
agent: auto
depends_on: ${JSON.stringify(dependsOn)}
reads: []
touches: ["src/**"]
context_budget: 8000
status: pending
attempts: 0
draft: false
---

## Görev

x

## Kabul kriterleri

- çalışır

## Handoff

*(Henüz çalıştırılmadı.)*
`;

function setupGraph(): { dir: string; graphDir: string } {
  const dir = mkdtempSync(join(tmpdir(), "gp-fullloop-test-"));
  execSync("git init -q", { cwd: dir });
  execSync('git config user.email "t@t.com" && git config user.name "t"', { cwd: dir });
  const graphDir = join(dir, ".graph");
  mkdirSync(graphDir, { recursive: true });
  writeFileSync(join(graphDir, "config.yml"), CONFIG_YML);
  writeFileSync(join(graphDir, "a.md"), TASK_MD("E01-F01-T01"));
  writeFileSync(join(graphDir, "b.md"), TASK_MD("E01-F01-T02", ["E01-F01-T01"]));
  execSync("git add -A && git commit -q -m init", { cwd: dir });
  return { dir, graphDir };
}

describe("tam döngü — mutlu yol: 1 düzeltme turu, sonra yakınsar, done olur", () => {
  it("pending → running → (fail) → (fix) → (pass) → Katman2 ok → done", () => {
    const { dir, graphDir } = setupGraph();
    try {
      let graph = parseGraph(graphDir);
      const config = ConfigSchema.parse(graph.rawConfig);

      const next = computeNext(graph);
      expect(next.ready.map((n) => n.id)).toEqual(["E01-F01-T01"]);

      const route = resolveRoute(next.ready[0], config);
      expect(route.model).toBe("haiku");

      setFrontmatter(graph, "E01-F01-T01", { status: "running" });
      graph = parseGraph(graphDir);

      // --- Tur 1: Katman 1 (script) başarısız — "ajan" henüz bitirmedi ---
      let checks = runChecks(dir, { test: "exit 1" });
      expect(checks.every((c) => c.ok)).toBe(false);
      recordFixLoopRound(graphDir, "E01-F01-T01", { round: 1, issuesCount: 1, tokens: 500 });
      let status = computeFixLoopStatus(
        [{ round: 1, issuesCount: 1, tokens: 500 }],
        { maxRounds: config.fix_loop.max_rounds, breakIfNoProgress: config.fix_loop.break_if_no_progress },
      );
      expect(status.shouldBreak).toBe(false);

      // --- "Ajan" eksikleri düzeltti (gerçek bir komutla simüle) ---
      checks = runChecks(dir, { test: "exit 0" });
      expect(checks.every((c) => c.ok)).toBe(true);

      // --- Katman 2 (mock claude -p) ---
      const task = graph.nodesById.get("E01-F01-T01")!;
      const criteria = extractAcceptanceCriteria(task)!;
      const diff = execSync("git diff HEAD", { cwd: dir, encoding: "utf-8" });
      const check = runAcceptanceCheck(criteria, diff, {
        model: "haiku",
        spawner: () => ({
          stdout: JSON.stringify({
            structured_output: { results: [{ kriter: "çalışır", durum: "ok", not: "tamam" }] },
          }),
          status: 0,
        }),
      });
      expect(check.success).toBe(true);
      expect(check.results.every((r) => r.durum === "ok")).toBe(true);

      recordFixLoopRound(graphDir, "E01-F01-T01", { round: 2, issuesCount: 0, tokens: 100 });
      status = computeFixLoopStatus(
        [
          { round: 1, issuesCount: 1, tokens: 500 },
          { round: 2, issuesCount: 0, tokens: 100 },
        ],
        { maxRounds: config.fix_loop.max_rounds, breakIfNoProgress: config.fix_loop.break_if_no_progress },
      );
      expect(status).toMatchObject({ shouldBreak: true, converged: true });

      // --- Başarı: Handoff'u doldur, commit, done ---
      writeFileSync(
        join(graphDir, "a.md"),
        TASK_MD("E01-F01-T01").replace(
          "*(Henüz çalıştırılmadı.)*",
          "Gerçek bir handoff metni burada olurdu.",
        ),
      );
      setFrontmatter(parseGraph(graphDir), "E01-F01-T01", { status: "done" });
      execSync('git add -A && git commit -q -m "gp(E01-F01-T01): done"', { cwd: dir });

      graph = parseGraph(graphDir);
      expect(validateGraph(graph)).toEqual([]);
      expect(graph.nodesById.get("E01-F01-T01")?.frontmatter.status).toBe("done");
      // T02 artık ready olmalı (bağımlılığı done oldu).
      expect(computeNext(graph).ready.map((n) => n.id)).toEqual(["E01-F01-T02"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("tam döngü — kötü yol: yakınsamıyor → escalate → escalate → tükendi → failed → blocked", () => {
  it("escalation listesi tükenince failed olur, bağımlı task blocked olur", () => {
    const { dir, graphDir } = setupGraph();
    try {
      let graph = parseGraph(graphDir);
      const config = ConfigSchema.parse(graph.rawConfig);
      setFrontmatter(graph, "E01-F01-T01", { status: "running" });

      // max_rounds=2: iki başarısız tur kaydet, yakınsamadı.
      recordFixLoopRound(graphDir, "E01-F01-T01", { round: 1, issuesCount: 2 });
      recordFixLoopRound(graphDir, "E01-F01-T01", { round: 2, issuesCount: 2 });
      let status = computeFixLoopStatus(
        [
          { round: 1, issuesCount: 2 },
          { round: 2, issuesCount: 2 },
        ],
        { maxRounds: config.fix_loop.max_rounds, breakIfNoProgress: config.fix_loop.break_if_no_progress },
      );
      expect(status).toMatchObject({ shouldBreak: true, converged: false });

      // 1. escalate: haiku → sonnet
      graph = parseGraph(graphDir);
      let esc = escalateNode(graph, "E01-F01-T01", config);
      expect(esc).toMatchObject({ escalated: true, fromModel: "haiku", toModel: "sonnet" });

      // Round sayacı SIFIRLANMAZ (SKILL.md kararı) — toplam geçmiş zaten max_rounds'ı
      // aştığı için bir sonraki kontrolde HEMEN shouldBreak:true.
      status = computeFixLoopStatus(
        [
          { round: 1, issuesCount: 2 },
          { round: 2, issuesCount: 2 },
        ],
        { maxRounds: config.fix_loop.max_rounds, breakIfNoProgress: config.fix_loop.break_if_no_progress },
      );
      expect(status.shouldBreak).toBe(true);

      // 2. escalate: sonnet → opus
      graph = parseGraph(graphDir);
      esc = escalateNode(graph, "E01-F01-T01", config);
      expect(esc).toMatchObject({ escalated: true, fromModel: "sonnet", toModel: "opus" });

      // 3. escalate denemesi: escalation listesi tükendi (opus zaten son model).
      graph = parseGraph(graphDir);
      esc = escalateNode(graph, "E01-F01-T01", config);
      expect(esc.escalated).toBe(false);

      // Hata politikası adım 3: terminal durum + bağımlıları blocked.
      graph = parseGraph(graphDir);
      const failResult = failNode(graph, "E01-F01-T01", "yakınsamadı, escalation tükendi");
      expect(failResult).toMatchObject({ ok: true, blockedDependents: ["E01-F01-T02"] });

      graph = parseGraph(graphDir);
      expect(graph.nodesById.get("E01-F01-T01")?.frontmatter.status).toBe("failed");
      expect(graph.nodesById.get("E01-F01-T02")?.frontmatter.status).toBe("blocked");
      // Artık hiçbir şey ready değil (deadlock) — next adımın raporlayacağı durum.
      expect(computeNext(graph).ready).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
