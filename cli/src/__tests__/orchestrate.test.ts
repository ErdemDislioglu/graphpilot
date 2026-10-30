import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseGraph } from "../graph/parser.js";
import {
  claimTasks,
  commitTask,
  completeTasks,
  computeChain,
  finishTask,
  gateTask,
  notifyEpicsDone,
  parsePorcelainZ,
  planWorkers,
  startTasks,
  withClaimLock,
} from "../orchestrate.js";
import { ConfigSchema } from "../schema/index.js";
import { withTempGraph } from "../testUtils/tempGraph.js";
import type { GitRunner } from "../check.js";

const CONFIG = ConfigSchema.parse({
  routing: [{ when: {}, model: "haiku" }],
  escalation: ["haiku"],
  max_attempts_per_model: 1,
  budgets: { default_context: 8000, max_turns: 20 },
  team: { enabled: false },
});

const NO_GIT: GitRunner = () => ({ stdout: "", status: 128 });

const fm = (obj: Record<string, unknown>, body = "## Görev\nx\n") =>
  `---\n${Object.entries(obj)
    .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
    .join("\n")}\n---\n${body}`;

const TASK = (id: string, extra: Record<string, unknown> = {}, body?: string) =>
  fm(
    {
      id,
      kind: "task",
      name: id,
      level: 3,
      summary: `özet ${id}`,
      type: "feature",
      complexity: "low",
      risk: "low",
      context_size: "small",
      model: "auto",
      agent: "auto",
      context_budget: 8000,
      status: "pending",
      attempts: 0,
      touches: ["src/store.js"],
      ...extra,
    },
    body,
  );

const EPIC = fm({ id: "E01", kind: "epic", name: "E01-x", summary: "s", status: "pending", expanded: true });
const FEATURE = fm({ id: "E01-F01", kind: "feature", name: "F01-x", summary: "s", status: "pending", expanded: true });

describe("computeChain — Faz 14 O16", () => {
  it("aynı dosyaya dokunan sıralı görevleri toplar; risk:high'da durur", () => {
    withTempGraph(
      {
        "E01-x/epic.md": EPIC,
        "E01-x/tasks/F01-x.md": FEATURE,
        "E01-x/tasks/F01-T01-a.md": TASK("E01-F01-T01"),
        "E01-x/tasks/F01-T02-b.md": TASK("E01-F01-T02", { depends_on: ["E01-F01-T01"] }),
        "E01-x/tasks/F01-T03-c.md": TASK("E01-F01-T03", {
          depends_on: ["E01-F01-T02"],
          touches: ["src/store.js", "test/store.test.js"],
        }),
        "E01-x/tasks/F01-T04-d.md": TASK("E01-F01-T04", { depends_on: ["E01-F01-T03"], risk: "high" }),
      },
      (graph) => {
        expect(computeChain(graph, "E01-F01-T01", CONFIG)).toEqual(["E01-F01-T01", "E01-F01-T02", "E01-F01-T03"]);
      },
    );
  });

  it("farklı dosya, birden çok ardıl, max_tasks ve kapalı ayar zinciri keser", () => {
    withTempGraph(
      {
        "E01-x/epic.md": EPIC,
        "E01-x/tasks/F01-x.md": FEATURE,
        "E01-x/tasks/F01-T01-a.md": TASK("E01-F01-T01"),
        "E01-x/tasks/F01-T02-b.md": TASK("E01-F01-T02", { depends_on: ["E01-F01-T01"] }),
        "E01-x/tasks/F01-T03-c.md": TASK("E01-F01-T03", { depends_on: ["E01-F01-T02"], touches: ["src/http.js"] }),
        "E01-x/tasks/F01-T04-d.md": TASK("E01-F01-T04", { touches: ["src/a.js"] }),
        "E01-x/tasks/F01-T05-e.md": TASK("E01-F01-T05", { depends_on: ["E01-F01-T04"], touches: ["src/a.js"] }),
        "E01-x/tasks/F01-T06-f.md": TASK("E01-F01-T06", { depends_on: ["E01-F01-T04"], touches: ["src/a.js"] }),
      },
      (graph) => {
        expect(computeChain(graph, "E01-F01-T01", CONFIG)).toEqual(["E01-F01-T01", "E01-F01-T02"]);
        expect(computeChain(graph, "E01-F01-T04", CONFIG)).toEqual(["E01-F01-T04"]);
        const one = { ...CONFIG, efficiency: { ...CONFIG.efficiency, feature_agent_max_tasks: 1 } };
        expect(computeChain(graph, "E01-F01-T01", one)).toEqual(["E01-F01-T01"]);
        const off = { ...CONFIG, efficiency: { ...CONFIG.efficiency, feature_agent: false } };
        expect(computeChain(graph, "E01-F01-T01", off)).toEqual(["E01-F01-T01"]);
      },
    );
  });
});

describe("startTasks — Faz 14 O5/O6", () => {
  it("context yazar, running işaretler, içerik değil yol döner; git yoksa repo:false", () => {
    withTempGraph(
      {
        "E01-x/epic.md": EPIC,
        "E01-x/tasks/F01-x.md": FEATURE,
        "E01-x/tasks/F01-T01-a.md": TASK("E01-F01-T01", { verify: ["node --test"] }),
        "E01-x/tasks/F01-T02-b.md": TASK("E01-F01-T02", { model: "sonnet" }),
      },
      (_graph, dir) => {
        const result = startTasks(dir, ["E01-F01-T01", "E01-F01-T02"], CONFIG, { projectRoot: dir, git: NO_GIT });
        expect(result.tasks.map((t) => [t.id, t.model, t.verify])).toEqual([
          ["E01-F01-T01", "haiku", ["node --test"]],
          ["E01-F01-T02", "sonnet", []],
        ]);
        expect(existsSync(result.tasks[0].contextPath)).toBe(true);
        expect(result.group).toEqual({ agent: "coder", model: "sonnet", max_turns: 40 });
        expect(result.git).toEqual({ repo: false, base: null });
        const graph = parseGraph(dir);
        expect(graph.nodesById.get("E01-F01-T01")!.frontmatter.status).toBe("running");
        expect(graph.nodesById.get("E01-F01-T02")!.frontmatter.status).toBe("running");
      },
    );
  });
});

describe("gateTask — Faz 14 O5/O9/B11", () => {
  const files = (extra: Record<string, unknown>) => ({
    "E01-x/epic.md": EPIC,
    "E01-x/tasks/F01-x.md": FEATURE,
    "E01-x/tasks/F01-T01-a.md": TASK("E01-F01-T01", extra, "## Görev\nx\n\n## Kabul kriterleri\n- A\n"),
  });

  it("verify başarısız → fix; sonraki turda geçer → done, Katman 2 atlanır", () => {
    withTempGraph(files({ verify: ["npm test"] }), (_graph, dir) => {
      let pass = false;
      const runner = () => (pass ? { ok: true, output: "" } : { ok: false, output: "1 test kırık" });
      const first = gateTask(dir, "E01-F01-T01", CONFIG, { projectRoot: dir, round: 1, runner, git: NO_GIT });
      expect(first).toMatchObject({ decision: "fix", issues: ["[verify] npm test\n1 test kırık"] });
      pass = true;
      const second = gateTask(dir, "E01-F01-T01", CONFIG, { projectRoot: dir, round: 2, runner, git: NO_GIT });
      expect(second).toMatchObject({ decision: "done", issues: [], layer2: "skipped-verify", unverified: false });
    });
  });

  it("git'siz ve verify'sız: eksik sayılmaz ama unverified:true", () => {
    withTempGraph(files({}), (_graph, dir) => {
      const result = gateTask(dir, "E01-F01-T01", CONFIG, { projectRoot: dir, round: 1, git: NO_GIT });
      expect(result).toMatchObject({ decision: "done", layer2: "unavailable", unverified: true });
    });
  });

  it("verify'sız ve git varken Katman 2 çalışır; eksik kriter → fix", () => {
    withTempGraph(files({}), (_graph, dir) => {
      const git: GitRunner = (args) =>
        args[0] === "diff" ? { stdout: "+x", status: 0 } : { stdout: "true\n", status: 0 };
      const spawner = () => ({
        stdout: JSON.stringify({ structured_output: { results: [{ kriter: "A", durum: "eksik", not: "yok" }] } }),
        status: 0,
      });
      const result = gateTask(dir, "E01-F01-T01", CONFIG, { projectRoot: dir, round: 1, git, spawner });
      expect(result).toMatchObject({ decision: "fix", layer2: "ran", issues: ["[kabul] A — yok"] });
    });
  });
});

describe("finishTask — Faz 14 O5", () => {
  it("Handoff yoksa ok:false ve running'e geri döner", () => {
    withTempGraph(
      {
        "E01-x/epic.md": EPIC,
        "E01-x/tasks/F01-x.md": FEATURE,
        "E01-x/tasks/F01-T01-a.md": TASK("E01-F01-T01", { status: "running" }),
      },
      (_graph, dir) => {
        const result = finishTask(dir, "E01-F01-T01", CONFIG, { projectRoot: dir, git: NO_GIT });
        expect(result.ok).toBe(false);
        expect(result.errors[0]).toContain("Handoff");
        expect(parseGraph(dir).nodesById.get("E01-F01-T01")!.frontmatter.status).toBe("running");
      },
    );
  });

  it("son gate turu eksikle bittiyse bitirmez; temiz tur sonrası bitirir", () => {
    withTempGraph(
      {
        "E01-x/epic.md": EPIC,
        "E01-x/tasks/F01-x.md": FEATURE,
        "E01-x/tasks/F01-T01-a.md": TASK(
          "E01-F01-T01",
          { status: "running", verify: ["x"] },
          "## Görev\nx\n\n## Handoff\nbitti\n",
        ),
      },
      (_graph, dir) => {
        const fails = () => ({ ok: false, output: "kırık" });
        gateTask(dir, "E01-F01-T01", CONFIG, { projectRoot: dir, round: 1, runner: fails, git: NO_GIT });
        const blocked = finishTask(dir, "E01-F01-T01", CONFIG, { projectRoot: dir, git: NO_GIT });
        expect(blocked.ok).toBe(false);
        expect(blocked.errors[0]).toContain("1 eksikle bitti");
        expect(parseGraph(dir).nodesById.get("E01-F01-T01")!.frontmatter.status).toBe("running");

        const passes = () => ({ ok: true, output: "" });
        gateTask(dir, "E01-F01-T01", CONFIG, { projectRoot: dir, round: 2, runner: passes, git: NO_GIT });
        expect(finishTask(dir, "E01-F01-T01", CONFIG, { projectRoot: dir, git: NO_GIT }).ok).toBe(true);
      },
    );
  });

  it("done + roll-up + context silme + git'te tek commit", () => {
    withTempGraph(
      {
        "E01-x/epic.md": EPIC,
        "E01-x/tasks/F01-x.md": FEATURE,
        "E01-x/tasks/F01-T01-a.md": TASK("E01-F01-T01", { status: "running" }, "## Görev\nx\n\n## Handoff\nbitti\n"),
      },
      (_graph, dir) => {
        const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, encoding: "utf-8", stdio: "pipe" });
        git("init", "-q");
        git("config", "user.email", "t@example.com");
        git("config", "user.name", "t");
        git("add", "-A");
        git("commit", "-q", "-m", "baz");
        const base = git("rev-parse", "HEAD").trim();
        mkdirSync(join(dir, "_runtime"), { recursive: true });
        writeFileSync(join(dir, "_runtime", "E01-F01-T01.context.md"), "x");
        writeFileSync(join(dir, "kod.js"), "1\n");
        git("add", "-A");
        git("commit", "-q", "-m", "gp-wip(E01-F01-T01): tur 1");
        writeFileSync(join(dir, "kod.js"), "2\n");

        const result = finishTask(dir, "E01-F01-T01", { ...CONFIG, optimizations: { ...CONFIG.optimizations, repo_map: false } }, {
          projectRoot: dir,
          base,
        });
        expect(result).toMatchObject({ ok: true, committed: true, epicDone: true });
        expect(result.rollup.map((c) => c.id)).toEqual(["E01", "E01-F01"]);
        expect(existsSync(join(dir, "_runtime", "E01-F01-T01.context.md"))).toBe(false);
        expect(git("log", "--format=%s").trim().split("\n")).toEqual(["gp(E01-F01-T01): özet E01-F01-T01", "baz"]);
        expect(readFileSync(join(dir, "kod.js"), "utf-8")).toBe("2\n");
      },
    );
  });
});

const HANDOFF = "## Görev\nx\n\n## Handoff\nbitti\n";

/** Gerçek git deposu: graph dizini aynı zamanda proje kökü (diğer finishTask testi gibi). */
function initRepo(dir: string) {
  const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, encoding: "utf-8", stdio: "pipe" });
  git("init", "-q");
  git("config", "user.email", "t@example.com");
  git("config", "user.name", "t");
  git("add", "-A");
  git("commit", "-q", "-m", "baz");
  return git;
}

const NO_REPOMAP = { ...CONFIG, optimizations: { ...CONFIG.optimizations, repo_map: false } };

describe("parsePorcelainZ — Faz 15", () => {
  it("yolları ve yeniden adlandırmada iki yolu da verir", () => {
    expect(parsePorcelainZ(" M src/a.js\0?? yeni dosya.js\0R  b.js\0eski.js\0")).toEqual([
      "src/a.js",
      "yeni dosya.js",
      "b.js",
      "eski.js",
    ]);
  });
});

describe("commitTask — Faz 15 paralel görev commit'i", () => {
  it("başka running görevin dosyalarını almaz; onun commit'ini reset ile yutmaz", () => {
    withTempGraph(
      {
        "E01-x/epic.md": EPIC,
        "E01-x/tasks/F01-x.md": FEATURE,
        "E01-x/tasks/F01-T01-a.md": TASK("E01-F01-T01", { status: "running", touches: ["src/a.js"] }, HANDOFF),
        "E01-x/tasks/F01-T02-b.md": TASK("E01-F01-T02", { status: "running", touches: ["src/b.js"] }, HANDOFF),
      },
      (_graph, dir) => {
        const git = initRepo(dir);
        const base = git("rev-parse", "HEAD").trim();
        mkdirSync(join(dir, "src"));
        writeFileSync(join(dir, "src", "a.js"), "a\n");
        writeFileSync(join(dir, "src", "b.js"), "b-yarım\n");

        // B'nin önce bittiğini, sonra A'nın bittiğini düşün — ikisinin de base'i aynı.
        const first = commitTask(dir, "E01-F01-T01", { projectRoot: dir, base, git: (a, c) => run(a, c) });
        expect(first).toEqual({ committed: true, left: ["src/b.js"] });
        expect(git("show", "--name-only", "--format=", "HEAD").trim().split("\n")).toEqual(["src/a.js"]);

        // T01 artık done; T02 bitince base'e reset ATMAMALI (araya başka commit girdi).
        writeFileSync(
          join(dir, "E01-x/tasks/F01-T01-a.md"),
          TASK("E01-F01-T01", { status: "done", touches: ["src/a.js"] }, HANDOFF),
        );
        const second = commitTask(dir, "E01-F01-T02", { projectRoot: dir, base, git: (a, c) => run(a, c) });
        expect(second.committed).toBe(true);
        expect(git("log", "--format=%s").trim().split("\n")).toEqual([
          "gp(E01-F01-T02): özet E01-F01-T02",
          "gp(E01-F01-T01): özet E01-F01-T01",
          "baz",
        ]);
      },
    );
  });

  it("siblings (zincir) birbirinin dosyasını dışlamaz", () => {
    withTempGraph(
      {
        "E01-x/epic.md": EPIC,
        "E01-x/tasks/F01-x.md": FEATURE,
        "E01-x/tasks/F01-T01-a.md": TASK("E01-F01-T01", { status: "running" }, HANDOFF),
        "E01-x/tasks/F01-T02-b.md": TASK("E01-F01-T02", { status: "running" }, HANDOFF),
      },
      (_graph, dir) => {
        initRepo(dir);
        mkdirSync(join(dir, "src"));
        writeFileSync(join(dir, "src", "store.js"), "x\n");
        const result = commitTask(dir, "E01-F01-T01", {
          projectRoot: dir,
          git: (a, c) => run(a, c),
          siblings: ["E01-F01-T01", "E01-F01-T02"],
        });
        expect(result).toEqual({ committed: true, left: [] });
      },
    );
  });
});

function run(args: string[], cwd: string) {
  try {
    return { stdout: execFileSync("git", args, { cwd, encoding: "utf-8", stdio: "pipe" }), status: 0 };
  } catch (err) {
    const e = err as { stdout?: string; status?: number };
    return { stdout: e.stdout ?? "", status: e.status ?? 1 };
  }
}

describe("completeTasks — Faz 15", () => {
  const files = (extra: Record<string, unknown> = {}) => ({
    "E01-x/epic.md": EPIC,
    "E01-x/tasks/F01-x.md": FEATURE,
    "E01-x/tasks/F01-T01-a.md": TASK("E01-F01-T01", { status: "running", verify: ["npm test"], ...extra }, HANDOFF),
  });

  it("eksik → fix (tur otomatik artar); geçince done + epic bitti", () => {
    withTempGraph(files(), (_graph, dir) => {
      let pass = false;
      const runner = () => (pass ? { ok: true, output: "" } : { ok: false, output: "kırık" });
      const first = completeTasks(dir, ["E01-F01-T01"], NO_REPOMAP, { projectRoot: dir, runner, git: NO_GIT });
      expect(first.fix).toEqual([{ id: "E01-F01-T01", round: 1, issues: ["[verify] npm test\nkırık"] }]);
      pass = true;
      const second = completeTasks(dir, ["E01-F01-T01"], NO_REPOMAP, { projectRoot: dir, runner, git: NO_GIT });
      expect(second.done).toEqual([{ id: "E01-F01-T01", committed: false, unverified: false }]);
      expect(second.epicsDone).toEqual(["E01"]);
      expect(parseGraph(dir).nodesById.get("E01-F01-T01")!.frontmatter.status).toBe("done");
    });
  });

  it("yakınsamazsa üst modele yükseltip kuyruğa koyar ve tur sayacını sıfırlar", () => {
    const config = { ...NO_REPOMAP, escalation: ["haiku", "sonnet"] as typeof CONFIG.escalation, fix_loop: { ...CONFIG.fix_loop, max_rounds: 1 } };
    withTempGraph(files(), (_graph, dir) => {
      const runner = () => ({ ok: false, output: "kırık" });
      const result = completeTasks(dir, ["E01-F01-T01"], config, { projectRoot: dir, runner, git: NO_GIT });
      expect(result.requeued).toEqual([{ id: "E01-F01-T01", agent: "coder", model: "sonnet" }]);
      const node = parseGraph(dir).nodesById.get("E01-F01-T01")!;
      expect(node.frontmatter.status).toBe("pending");

      // Yeni model ilk turda fix alır (hemen tekrar yükseltilmez).
      setRunning(dir);
      const again = completeTasks(dir, ["E01-F01-T01"], { ...config, fix_loop: { ...config.fix_loop, max_rounds: 2 } }, {
        projectRoot: dir,
        runner,
        git: NO_GIT,
      });
      expect(again.fix.map((f) => f.round)).toEqual([1]);
    });
  });

  it("zincirin sonunda fail; running olmayan görev hata listesine düşer", () => {
    const config = { ...NO_REPOMAP, fix_loop: { ...CONFIG.fix_loop, max_rounds: 1 } };
    withTempGraph(files(), (_graph, dir) => {
      const runner = () => ({ ok: false, output: "kırık" });
      const result = completeTasks(dir, ["E01-F01-T01"], config, { projectRoot: dir, runner, git: NO_GIT });
      expect(result.failed.map((f) => f.id)).toEqual(["E01-F01-T01"]);
      expect(parseGraph(dir).nodesById.get("E01-F01-T01")!.frontmatter.status).toBe("failed");
      const again = completeTasks(dir, ["E01-F01-T01"], config, { projectRoot: dir, runner, git: NO_GIT });
      expect(again.errors[0].errors[0]).toContain("running değil");
    });
  });
});

function setRunning(dir: string) {
  const path = join(dir, "E01-x/tasks/F01-T01-a.md");
  writeFileSync(path, readFileSync(path, "utf-8").replace(/status: "?pending"?/, "status: running"));
}

describe("claimTasks / withClaimLock — Faz 15", () => {
  const files = {
    "E01-x/epic.md": EPIC,
    "E01-x/tasks/F01-x.md": FEATURE,
    "E01-x/tasks/F01-T01-a.md": TASK("E01-F01-T01", { status: "running", touches: ["src/store.js"] }),
    "E01-x/tasks/F01-T02-b.md": TASK("E01-F01-T02", { touches: ["src/store.js"] }),
    "E01-x/tasks/F01-T03-c.md": TASK("E01-F01-T03", { touches: ["src/http.js"] }),
    "E01-x/tasks/F01-T04-d.md": TASK("E01-F01-T04", { touches: ["src/x.js"], model: "sonnet" }),
  };

  it("rotası uyan, running görevle dosya çakışmayan ilk görevi başlatır", () => {
    withTempGraph(files, (_graph, dir) => {
      const result = claimTasks(dir, CONFIG, { agent: "coder", model: "haiku", projectRoot: dir, git: NO_GIT });
      expect(result.claimed!.tasks.map((t) => t.id)).toEqual(["E01-F01-T03"]);
      expect(result.waiting).toBe(1);
      expect(parseGraph(dir).nodesById.get("E01-F01-T03")!.frontmatter.status).toBe("running");

      const sonnet = claimTasks(dir, CONFIG, { agent: "coder", model: "sonnet", projectRoot: dir, git: NO_GIT });
      expect(sonnet.claimed!.tasks.map((t) => t.id)).toEqual(["E01-F01-T04"]);
      const none = claimTasks(dir, CONFIG, { agent: "coder", model: "sonnet", projectRoot: dir, git: NO_GIT });
      expect(none).toEqual({ claimed: null, waiting: 0 });
      expect(existsSync(join(dir, "_runtime", "claim.lock"))).toBe(false);
    });
  });

  it("taze kilitte bekleyip zaman aşımına düşer; eski kilidi temizler", () => {
    withTempGraph({}, (_graph, dir) => {
      mkdirSync(join(dir, "_runtime"), { recursive: true });
      const lock = join(dir, "_runtime", "claim.lock");
      writeFileSync(lock, "");
      expect(() => withClaimLock(dir, () => 1, { timeoutMs: 100 })).toThrow("claim kilidi");
      const old = new Date(Date.now() - 60_000);
      utimesSync(lock, old, old);
      expect(withClaimLock(dir, () => 42)).toBe(42);
    });
  });
});

describe("planWorkers — Faz 15", () => {
  it("hazır görevleri rotaya göre gruplar, parallelism'den çalışanları düşer", () => {
    withTempGraph(
      {
        "E01-x/epic.md": EPIC,
        "E01-x/tasks/F01-x.md": FEATURE,
        "E01-x/tasks/F01-T01-a.md": TASK("E01-F01-T01", { touches: ["a"] }),
        "E01-x/tasks/F01-T02-b.md": TASK("E01-F01-T02", { touches: ["b"] }),
        "E01-x/tasks/F01-T03-c.md": TASK("E01-F01-T03", { touches: ["c"], model: "sonnet" }),
      },
      (_graph, dir) => {
        expect(planWorkers(dir, { ...CONFIG, parallelism: 3 })).toEqual({
          launch: [
            { agent: "coder", model: "haiku", ready: 2 },
            { agent: "coder", model: "sonnet", ready: 1 },
          ],
          running: 0,
          expand: [],
          finished: false,
        });
        expect(planWorkers(dir, { ...CONFIG, parallelism: 1 }).launch).toHaveLength(1);
      },
    );
  });

  it("iş kalmadıysa finished", () => {
    withTempGraph(
      { "E01-x/epic.md": EPIC, "E01-x/tasks/F01-x.md": FEATURE, "E01-x/tasks/F01-T01-a.md": TASK("E01-F01-T01", { status: "done" }) },
      (_graph, dir) => {
        expect(planWorkers(dir, CONFIG)).toMatchObject({ launch: [], running: 0, finished: true });
      },
    );
  });
});

describe("workflow — Faz 15 Mod A dal/push/bildirim", () => {
  it("branch_per_epic: başka görev çalışmıyorsa epic dalına geçer", () => {
    withTempGraph(
      { "E01-x/epic.md": EPIC, "E01-x/tasks/F01-x.md": FEATURE, "E01-x/tasks/F01-T01-a.md": TASK("E01-F01-T01") },
      (_graph, dir) => {
        const git = initRepo(dir);
        const config = { ...CONFIG, workflow: { ...CONFIG.workflow, branch_per_epic: true } };
        startTasks(dir, ["E01-F01-T01"], config, { projectRoot: dir });
        expect(git("rev-parse", "--abbrev-ref", "HEAD").trim()).toBe("feature/E01-x");
      },
    );
  });

  it("push_on_epic_done: epic bitince push denenir", () => {
    withTempGraph(
      { "E01-x/epic.md": EPIC, "E01-x/tasks/F01-x.md": FEATURE, "E01-x/tasks/F01-T01-a.md": TASK("E01-F01-T01", { status: "running" }, HANDOFF) },
      (_graph, dir) => {
        initRepo(dir);
        writeFileSync(join(dir, "kod.js"), "1\n");
        const calls: string[][] = [];
        const git = (args: string[], cwd: string) => {
          calls.push(args);
          return args[0] === "push" ? { stdout: "", status: 0 } : run(args, cwd);
        };
        const config = { ...NO_REPOMAP, workflow: { ...CONFIG.workflow, push_on_epic_done: true } };
        const result = finishTask(dir, "E01-F01-T01", config, { projectRoot: dir, git });
        expect(result).toMatchObject({ ok: true, committed: true, epicDone: true, pushed: true });
        expect(calls.some((a) => a[0] === "push")).toBe(true);
      },
    );
  });

  it("notifyEpicsDone: ağ hatası görevi bozmaz", async () => {
    const { withTempGraphAsync } = await import("../testUtils/tempGraph.js");
    await withTempGraphAsync(
      { "E01-x/epic.md": EPIC, "E01-x/tasks/F01-x.md": FEATURE, "E01-x/tasks/F01-T01-a.md": TASK("E01-F01-T01") },
      async (_graph, dir) => {
        const texts: string[] = [];
        const ok = await notifyEpicsDone(dir, ["E01"], CONFIG, async (t) => texts.push(t));
        expect(ok).toEqual({ sent: 1, failed: 0 });
        expect(texts[0]).toContain("E01");
        const bad = await notifyEpicsDone(dir, ["E01"], CONFIG, async () => {
          throw new Error("ağ");
        });
        expect(bad).toEqual({ sent: 0, failed: 1 });
      },
    );
  });
});
