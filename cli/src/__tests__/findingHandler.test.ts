import { readFileSync } from "node:fs";
import matter from "gray-matter";
import { describe, expect, it } from "vitest";
import {
  computeFindingImpact,
  handleFinding,
  resolveAfterSeniorConsultation,
} from "../team/findingHandler.js";
import { readDecisions } from "../team/decisionLog.js";
import { readEvents } from "../autopilot/eventBus.js";
import { MockNotifier } from "../autopilot/notifier.js";
import { ConfigSchema } from "../schema/index.js";
import { withTempGraph, withTempGraphAsync } from "../testUtils/tempGraph.js";

const TASK = (overrides: Record<string, unknown>) => ({
  id: "E01-F01-T01",
  kind: "task",
  name: "a",
  level: 3,
  summary: "s",
  type: "feature",
  complexity: "low",
  risk: "low",
  context_size: "small",
  model: "auto",
  agent: "auto",
  context_budget: 8000,
  status: "running",
  attempts: 0,
  ...overrides,
});

function epicFrontmatter(id: string, name: string): string {
  const obj = { id, kind: "epic", name, summary: "s", status: "pending", expanded: true };
  const lines = Object.entries(obj).map(([k, v]) => `${k}: ${JSON.stringify(v)}`);
  return `---\n${lines.join("\n")}\n---\n## Epic\nx\n`;
}

function taskFrontmatter(obj: Record<string, unknown>): string {
  const lines = Object.entries(obj).map(([k, v]) => `${k}: ${JSON.stringify(v)}`);
  return `---\n${lines.join("\n")}\n---\n## Görev\nx\n\n## Hata geçmişi\n\n*(yok)*\n`;
}

const SECURITY_FINDING = {
  kind: "security" as const,
  severity: "blocking" as const,
  summary: "Şifre sıfırlama token'ı süresiz",
  options: ["15 dk süre sınırı ekle", "Olduğu gibi bırak", "Ayrı görev aç"],
  recommended: 0,
};

const balancedConfig = () =>
  ConfigSchema.parse({
    routing: [{ when: {}, model: "haiku" }],
    escalation: ["haiku"],
    max_attempts_per_model: 1,
    budgets: { default_context: 8000, max_turns: 25 },
    team: { enabled: true },
  });

const boldConfig = () =>
  ConfigSchema.parse({
    routing: [{ when: {}, model: "haiku" }],
    escalation: ["haiku"],
    max_attempts_per_model: 1,
    budgets: { default_context: 8000, max_turns: 25 },
    team: { enabled: true, manager: { autonomy: "bold" } },
  });

describe("handleFinding — bloklamayan (roadmap 13.7)", () => {
  it("önerilen seçenekle devam eder, kararı kaydeder, düğüme dokunmaz", async () => {
    await withTempGraphAsync(
      {
        "E01-x/epic.md": epicFrontmatter("E01", "E01-x"),
        "E01-x/tasks/F01-T01-a.md": taskFrontmatter(TASK({})),
      },
      async (graph, dir) => {
        const notifier = new MockNotifier();
        const outcome = await handleFinding({
          graph,
          graphRootDir: dir,
          config: balancedConfig(),
          notifier,
          lang: "tr",
          node: graph.nodesById.get("E01-F01-T01")!,
          finding: { ...SECURITY_FINDING, severity: "non_blocking" },
        });
        expect(outcome).toEqual({ kind: "proceeded_with_recommended", nodeId: "E01-F01-T01", chosenOptionIndex: 0 });
        expect(notifier.sent).toHaveLength(0);
        expect(notifier.asked).toHaveLength(0);

        const after = matter(readFileSync(`${dir}/E01-x/tasks/F01-T01-a.md`, "utf-8"));
        expect(after.data.status).toBe("running"); // dokunulmadı

        expect(readDecisions(dir)).toHaveLength(1);
      },
    );
  });
});

describe("handleFinding — bloklayan, security_vulnerability → HER ZAMAN ask_user", () => {
  it("kullanıcı bir seçenek seçerse: pending'e döner, karar kaydedilir", async () => {
    await withTempGraphAsync(
      {
        "E01-x/epic.md": epicFrontmatter("E01", "E01-x"),
        "E01-x/tasks/F01-T01-a.md": taskFrontmatter(TASK({})),
      },
      async (graph, dir) => {
        const notifier = new MockNotifier({ answers: ["0"] });
        const node = graph.nodesById.get("E01-F01-T01")!;
        const outcome = await handleFinding({
          graph,
          graphRootDir: dir,
          config: boldConfig(), // bold olsa da security ASK_USER kalmalı
          notifier,
          lang: "tr",
          node,
          finding: SECURITY_FINDING,
        });
        expect(outcome).toEqual({ kind: "user_chose", nodeId: "E01-F01-T01", chosenOptionIndex: 0 });
        expect(notifier.asked[0].question).toContain("Karar gerekiyor");

        const after = matter(readFileSync(`${dir}/E01-x/tasks/F01-T01-a.md`, "utf-8"));
        expect(after.data.status).toBe("pending");

        const eventTypes = readEvents(dir).map((e) => e.type);
        expect(eventTypes).toEqual(["needs_decision", "decision_answered"]);
      },
    );
  });

  it("kullanıcı 'Durdur' seçerse: failed olur, stopped döner", async () => {
    await withTempGraphAsync(
      {
        "E01-x/epic.md": epicFrontmatter("E01", "E01-x"),
        "E01-x/tasks/F01-T01-a.md": taskFrontmatter(TASK({})),
      },
      async (graph, dir) => {
        const notifier = new MockNotifier({ answers: ["stop"] });
        const outcome = await handleFinding({
          graph,
          graphRootDir: dir,
          config: balancedConfig(),
          notifier,
          lang: "tr",
          node: graph.nodesById.get("E01-F01-T01")!,
          finding: SECURITY_FINDING,
        });
        expect(outcome).toEqual({ kind: "stopped", nodeId: "E01-F01-T01" });
        const after = matter(readFileSync(`${dir}/E01-x/tasks/F01-T01-a.md`, "utf-8"));
        expect(after.data.status).toBe("failed");
      },
    );
  });
});

describe("handleFinding — bloklayan, scope_conflict", () => {
  it("balanced'ta ask_user'a gider", async () => {
    await withTempGraphAsync(
      {
        "E01-x/epic.md": epicFrontmatter("E01", "E01-x"),
        "E01-x/tasks/F01-T01-a.md": taskFrontmatter(TASK({})),
      },
      async (graph, dir) => {
        const notifier = new MockNotifier({ answers: ["1"] });
        const outcome = await handleFinding({
          graph,
          graphRootDir: dir,
          config: balancedConfig(),
          notifier,
          lang: "tr",
          node: graph.nodesById.get("E01-F01-T01")!,
          finding: { ...SECURITY_FINDING, kind: "out_of_scope" },
        });
        expect(outcome.kind).toBe("user_chose");
      },
    );
  });

  it("bold'ta manager kendisi çözer (self_resolved)", async () => {
    await withTempGraphAsync(
      {
        "E01-x/epic.md": epicFrontmatter("E01", "E01-x"),
        "E01-x/tasks/F01-T01-a.md": taskFrontmatter(TASK({})),
      },
      async (graph, dir) => {
        const notifier = new MockNotifier();
        const node = graph.nodesById.get("E01-F01-T01")!;
        const outcome = await handleFinding({
          graph,
          graphRootDir: dir,
          config: boldConfig(),
          notifier,
          lang: "tr",
          node,
          finding: { ...SECURITY_FINDING, kind: "out_of_scope" },
        });
        expect(outcome).toEqual({ kind: "self_resolved", nodeId: "E01-F01-T01", chosenOptionIndex: 0 });
        expect(notifier.asked).toHaveLength(0); // hiç sorulmadı

        const after = matter(readFileSync(`${dir}/E01-x/tasks/F01-T01-a.md`, "utf-8"));
        expect(after.data.status).toBe("pending");
      },
    );
  });
});

describe("resolveAfterSeniorConsultation — roadmap 13.8", () => {
  it("senior net öneri verdiyse kendisi çözer, 'manager+senior' kaydı eklenir", async () => {
    await withTempGraphAsync(
      {
        "E01-x/epic.md": epicFrontmatter("E01", "E01-x"),
        "E01-x/tasks/F01-T01-a.md": taskFrontmatter(TASK({})),
      },
      async (graph, dir) => {
        const notifier = new MockNotifier();
        const outcome = await resolveAfterSeniorConsultation({
          graph,
          graphRootDir: dir,
          notifier,
          lang: "tr",
          node: graph.nodesById.get("E01-F01-T01")!,
          finding: SECURITY_FINDING,
          seniorGaveConfidentRecommendation: true,
        });
        expect(outcome.kind).toBe("self_resolved");
        const decisions = readDecisions(dir);
        expect(decisions.some((d) => d.decidedBy === "manager+senior")).toBe(true);
      },
    );
  });

  it("senior emin değilse kullanıcıya sorar", async () => {
    await withTempGraphAsync(
      {
        "E01-x/epic.md": epicFrontmatter("E01", "E01-x"),
        "E01-x/tasks/F01-T01-a.md": taskFrontmatter(TASK({})),
      },
      async (graph, dir) => {
        const notifier = new MockNotifier({ answers: ["0"] });
        const outcome = await resolveAfterSeniorConsultation({
          graph,
          graphRootDir: dir,
          notifier,
          lang: "tr",
          node: graph.nodesById.get("E01-F01-T01")!,
          finding: SECURITY_FINDING,
          seniorGaveConfidentRecommendation: false,
        });
        expect(outcome.kind).toBe("user_chose");
      },
    );
  });
});

describe("computeFindingImpact", () => {
  it("doğrudan bağımlı pending görevleri sayar, diğerlerini bağımsız sayar", () => {
    withTempGraph(
      {
        "E01-x/epic.md": epicFrontmatter("E01", "E01-x"),
        "E01-x/tasks/F01-T01-a.md": taskFrontmatter(TASK({ id: "E01-F01-T01", name: "a" })),
        "E01-x/tasks/F01-T02-b.md": taskFrontmatter(
          TASK({ id: "E01-F01-T02", name: "b", status: "pending", depends_on: ["E01-F01-T01"] }),
        ),
        "E01-x/tasks/F01-T03-c.md": taskFrontmatter(
          TASK({ id: "E01-F01-T03", name: "c", status: "pending", depends_on: [] }),
        ),
        "E01-x/tasks/F01-T04-d.md": taskFrontmatter(
          TASK({ id: "E01-F01-T04", name: "d", status: "done", depends_on: [] }),
        ),
      },
      (graph) => {
        const impact = computeFindingImpact(graph, "E01-F01-T01");
        expect(impact.blockedTaskIds).toEqual(["E01-F01-T02"]);
        expect(impact.independentCount).toBe(1); // T03 (pending, bağımsız) — T04 done sayılmaz
      },
    );
  });
});
