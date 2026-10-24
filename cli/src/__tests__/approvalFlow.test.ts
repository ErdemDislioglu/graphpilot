import { readFileSync } from "node:fs";
import { join } from "node:path";
import matter from "gray-matter";
import { describe, expect, it } from "vitest";
import { needsApproval, notifyDeadlock, notifyLimit, requestApproval } from "../autopilot/approvalFlow.js";
import { readEvents } from "../autopilot/eventBus.js";
import { MockNotifier } from "../autopilot/notifier.js";
import { ConfigSchema } from "../schema/index.js";
import { withTempGraphAsync } from "../testUtils/tempGraph.js";

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
  status: "pending",
  attempts: 0,
  ...overrides,
});

function frontmatter(obj: Record<string, unknown>): string {
  const lines = Object.entries(obj).map(([k, v]) => `${k}: ${JSON.stringify(v)}`);
  return `---\n${lines.join("\n")}\n---\n## Görev\nx\n\n## Hata geçmişi\n\n*(yok)*\n`;
}

const BASE_CONFIG = {
  routing: [{ when: { complexity: "low" }, model: "haiku" }],
  escalation: ["haiku", "sonnet", "opus"],
  max_attempts_per_model: 1,
  budgets: { default_context: 8000, max_turns: 25 },
};

describe("needsApproval", () => {
  it("status: failed ise true döner", () => {
    const node = { frontmatter: { status: "failed" } } as never;
    expect(needsApproval(node, ConfigSchema.parse(BASE_CONFIG))).toBe(true);
  });

  it("risk: high ama on_risk_high kapalıysa false döner", () => {
    const node = { frontmatter: { status: "pending", risk: "high" } } as never;
    expect(needsApproval(node, ConfigSchema.parse(BASE_CONFIG))).toBe(false);
  });

  it("risk: high ve on_risk_high açıksa true döner", () => {
    const node = { frontmatter: { status: "pending", risk: "high" } } as never;
    const config = ConfigSchema.parse({ ...BASE_CONFIG, autopilot: { approvals: { on_risk_high: true } } });
    expect(needsApproval(node, config)).toBe(true);
  });

  it("ne failed ne risk:high ise false döner", () => {
    const node = { frontmatter: { status: "pending", risk: "low" } } as never;
    expect(needsApproval(node, ConfigSchema.parse(BASE_CONFIG))).toBe(false);
  });
});

describe("requestApproval", () => {
  it("düğümü needs_decision yapar, soruyu gönderir, 'retry' cevabında pending'e döner", async () => {
    await withTempGraphAsync(
      { "a.md": frontmatter(TASK({ status: "failed" })) },
      async (graph, dir) => {
        const notifier = new MockNotifier({ answers: ["retry"] });
        const config = ConfigSchema.parse(BASE_CONFIG);
        const node = graph.nodesById.get("E01-F01-T01")!;

        const outcome = await requestApproval({
          graph,
          graphRootDir: dir,
          config,
          notifier,
          lang: "tr",
          node,
          attempts: 3,
          lastError: "miktar testi",
        });

        expect(outcome).toEqual({ nodeId: "E01-F01-T01", decision: "retry", timedOut: false });
        expect(notifier.asked[0].question).toContain('"a" 3 denemede geçemedi');

        const after = matter(readFileSync(join(dir, "a.md"), "utf-8"));
        expect(after.data.status).toBe("pending");
        expect(after.content).toContain("E01-F01-T01 karar: retry");

        const events = readEvents(dir);
        expect(events.map((e) => e.type)).toEqual(["needs_decision", "decision_answered"]);
      },
    );
  });

  it("'skip' cevabında status: skipped yapar", async () => {
    await withTempGraphAsync(
      { "a.md": frontmatter(TASK({ status: "failed" })) },
      async (graph, dir) => {
        const notifier = new MockNotifier({ answers: ["skip"] });
        const node = graph.nodesById.get("E01-F01-T01")!;
        await requestApproval({
          graph,
          graphRootDir: dir,
          config: ConfigSchema.parse(BASE_CONFIG),
          notifier,
          lang: "tr",
          node,
          attempts: 1,
          lastError: "x",
        });
        const after = matter(readFileSync(join(dir, "a.md"), "utf-8"));
        expect(after.data.status).toBe("skipped");
      },
    );
  });

  it("'escalate' cevabında modeli yükseltir ve pending'e döner", async () => {
    await withTempGraphAsync(
      { "a.md": frontmatter(TASK({ status: "failed", model: "haiku" })) },
      async (graph, dir) => {
        const notifier = new MockNotifier({ answers: ["escalate"] });
        const node = graph.nodesById.get("E01-F01-T01")!;
        await requestApproval({
          graph,
          graphRootDir: dir,
          config: ConfigSchema.parse(BASE_CONFIG),
          notifier,
          lang: "tr",
          node,
          attempts: 1,
          lastError: "x",
        });
        const after = matter(readFileSync(join(dir, "a.md"), "utf-8"));
        expect(after.data.status).toBe("pending");
        expect(after.data.model).toBe("sonnet");
      },
    );
  });

  it("'stop' cevabında status: failed kalır", async () => {
    await withTempGraphAsync(
      { "a.md": frontmatter(TASK({ status: "failed" })) },
      async (graph, dir) => {
        const notifier = new MockNotifier({ answers: ["stop"] });
        const node = graph.nodesById.get("E01-F01-T01")!;
        await requestApproval({
          graph,
          graphRootDir: dir,
          config: ConfigSchema.parse(BASE_CONFIG),
          notifier,
          lang: "tr",
          node,
          attempts: 1,
          lastError: "x",
        });
        const after = matter(readFileSync(join(dir, "a.md"), "utf-8"));
        expect(after.data.status).toBe("failed");
      },
    );
  });

  it("zaman aşımında timeout_action uygulanır ve kullanıcıya bilgi mesajı gider (sleep enjekte edilir, gerçekten beklemez)", async () => {
    await withTempGraphAsync(
      { "a.md": frontmatter(TASK({ status: "failed" })) },
      async (graph, dir) => {
        // Gerçekçi zaman aşımı senaryosu: kullanıcı HİÇ cevap vermez — ask() sonsuza
        // kadar askıda kalan bir Promise döner (MockNotifier'ın boş-kuyruk durumunda
        // fırlattığı hata burada UYGUN DEĞİL: o anlık bir reddi simüle eder, "cevap
        // gelmedi" durumunu değil).
        const sent: string[] = [];
        const notifier = {
          async send(message: string) {
            sent.push(message);
          },
          ask(): Promise<string> {
            return new Promise(() => {});
          },
          async edit() {},
        };
        const config = ConfigSchema.parse({
          ...BASE_CONFIG,
          autopilot: { approvals: { timeout_minutes: 1, timeout_action: "skip" } },
        });
        const node = graph.nodesById.get("E01-F01-T01")!;

        const outcome = await requestApproval({
          graph,
          graphRootDir: dir,
          config,
          notifier,
          lang: "tr",
          node,
          attempts: 1,
          lastError: "x",
          sleep: async () => {
            /* anında çözülür — gerçek 60s beklemez */
          },
        });

        expect(outcome.timedOut).toBe(true);
        expect(outcome.decision).toBe("skip");
        expect(sent.some((m) => m.includes("zaman aşımı"))).toBe(true);
        const after = matter(readFileSync(join(dir, "a.md"), "utf-8"));
        expect(after.data.status).toBe("skipped");
      },
    );
  });
});

describe("notifyDeadlock", () => {
  it("deadlock mesajını gönderir ve events.jsonl'e failure olayı yazar", async () => {
    await withTempGraphAsync({ "a.md": frontmatter(TASK({ status: "pending" })) }, async (_graph, dir) => {
      const notifier = new MockNotifier();
      await notifyDeadlock({
        graphRootDir: dir,
        notifier,
        lang: "tr",
        reasons: [{ nodeId: "E01-F01-T02", blockedBy: "E01-F01-T01", blockerStatus: "failed" }],
      });
      expect(notifier.sent[0]).toContain("Deadlock");
      expect(readEvents(dir).map((e) => e.type)).toEqual(["failure"]);
    });
  });
});

describe("notifyLimit", () => {
  it("limit mesajını gönderir ve events.jsonl'e limit_hit olayı yazar", async () => {
    await withTempGraphAsync({ "a.md": frontmatter(TASK({ status: "pending" })) }, async (_graph, dir) => {
      const notifier = new MockNotifier();
      await notifyLimit({ graphRootDir: dir, notifier, lang: "tr", resetHint: "14:20", doneCount: 18, totalCount: 26 });
      expect(notifier.sent[0]).toContain("18/26");
      expect(readEvents(dir).map((e) => e.type)).toEqual(["limit_hit"]);
    });
  });
});
