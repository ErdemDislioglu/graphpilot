import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseGraph } from "../graph/parser.js";
import { computeChain, finishTask, gateTask, startTasks } from "../orchestrate.js";
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
