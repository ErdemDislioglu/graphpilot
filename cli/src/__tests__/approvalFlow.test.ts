import { readFileSync } from "node:fs";
import { join } from "node:path";
import matter from "gray-matter";
import { describe, expect, it } from "vitest";
import {
  applyBlockedAnswer,
  autoBlockedAnswer,
  markBlocked,
  needsApproval,
  notifyDeadlock,
  notifyLimit,
  requestApproval,
} from "../autopilot/approvalFlow.js";
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

const RISK_CONFIG = { ...BASE_CONFIG, autopilot: { approvals: { on_risk_high: true } } };

/** T01 (bağımlılık) + T02 (risk: high, T01'e bağlı) — T02'nin durumu/T01'in durumu parametre. */
function riskGraphFiles(t02: Record<string, unknown>, t01Status = "done"): Record<string, string> {
  return {
    "a.md": frontmatter(TASK({ status: t01Status })),
    "b.md": frontmatter(
      TASK({ id: "E01-F01-T02", name: "b", risk: "high", depends_on: ["E01-F01-T01"], ...t02 }),
    ),
  };
}

describe("needsApproval", () => {
  it("status: failed ise true döner", async () => {
    await withTempGraphAsync({ "a.md": frontmatter(TASK({ status: "failed" })) }, async (graph) => {
      expect(needsApproval(graph.nodesById.get("E01-F01-T01")!, ConfigSchema.parse(BASE_CONFIG), graph)).toBe(true);
    });
  });

  it("risk: high ama on_risk_high kapalıysa false döner", async () => {
    await withTempGraphAsync(riskGraphFiles({ status: "pending" }), async (graph) => {
      expect(needsApproval(graph.nodesById.get("E01-F01-T02")!, ConfigSchema.parse(BASE_CONFIG), graph)).toBe(false);
    });
  });

  it("pending + bağımlılıkları done + risk: high + on_risk_high → true", async () => {
    await withTempGraphAsync(riskGraphFiles({ status: "pending" }), async (graph) => {
      expect(needsApproval(graph.nodesById.get("E01-F01-T02")!, ConfigSchema.parse(RISK_CONFIG), graph)).toBe(true);
    });
  });

  it("done olan risk: high görev → false (eski sonsuz döngü)", async () => {
    await withTempGraphAsync(riskGraphFiles({ status: "done" }), async (graph) => {
      expect(needsApproval(graph.nodesById.get("E01-F01-T02")!, ConfigSchema.parse(RISK_CONFIG), graph)).toBe(false);
    });
  });

  it("approved: true → false (bir kez sorulur)", async () => {
    await withTempGraphAsync(riskGraphFiles({ status: "pending", approved: true }), async (graph) => {
      expect(needsApproval(graph.nodesById.get("E01-F01-T02")!, ConfigSchema.parse(RISK_CONFIG), graph)).toBe(false);
    });
  });

  it("bağımlılığı bitmemiş → false (henüz sıradaki değil)", async () => {
    await withTempGraphAsync(riskGraphFiles({ status: "pending" }, "pending"), async (graph) => {
      expect(needsApproval(graph.nodesById.get("E01-F01-T02")!, ConfigSchema.parse(RISK_CONFIG), graph)).toBe(false);
    });
  });

  it("ne failed ne risk:high ise false döner", async () => {
    await withTempGraphAsync({ "a.md": frontmatter(TASK({})) }, async (graph) => {
      expect(needsApproval(graph.nodesById.get("E01-F01-T01")!, ConfigSchema.parse(RISK_CONFIG), graph)).toBe(false);
    });
  });
});

describe("requestApproval — risk yolu", () => {
  it("approve → approved: true, status pending kalır, ayrı risk mesajı + Onayla/Atla/Durdur", async () => {
    await withTempGraphAsync(riskGraphFiles({ status: "pending" }), async (graph, dir) => {
      const notifier = new MockNotifier({ answers: ["approve"] });
      const outcome = await requestApproval({
        graph,
        graphRootDir: dir,
        config: ConfigSchema.parse(RISK_CONFIG),
        notifier,
        lang: "tr",
        node: graph.nodesById.get("E01-F01-T02")!,
        attempts: 0,
        lastError: "",
        kind: "risk",
      });
      expect(outcome.decision).toBe("approve");
      expect(notifier.asked[0].question).toBe('⚠️ E01-F01-T02 "b" riskli (risk: high). Başlatılsın mı?');
      expect(notifier.asked[0].options.map((o) => o.value)).toEqual(["approve", "skip", "stop"]);
      const after = matter(readFileSync(join(dir, "b.md"), "utf-8"));
      expect(after.data.approved).toBe(true);
      expect(after.data.status).toBe("pending");
    });
  });

  it("zaman aşımı + timeout_action: stop → görev failed OLMAZ, pending kalır", async () => {
    await withTempGraphAsync(riskGraphFiles({ status: "pending" }), async (graph, dir) => {
      const notifier = {
        async send() {},
        ask(): Promise<string> {
          return new Promise(() => {});
        },
        async edit() {},
      };
      const outcome = await requestApproval({
        graph,
        graphRootDir: dir,
        config: ConfigSchema.parse({
          ...BASE_CONFIG,
          autopilot: { approvals: { on_risk_high: true, timeout_minutes: 1, timeout_action: "stop" } },
        }),
        notifier,
        lang: "tr",
        node: graph.nodesById.get("E01-F01-T02")!,
        attempts: 0,
        lastError: "",
        kind: "risk",
        sleep: async () => {},
      });
      expect(outcome).toEqual({ nodeId: "E01-F01-T02", decision: "stop", timedOut: true });
      const after = matter(readFileSync(join(dir, "b.md"), "utf-8"));
      expect(after.data.status).toBe("pending");
      expect(after.data.approved).toBeUndefined();
    });
  });

  it("poll verilirse bekleme parçalanır ve her parça arasında poll edilir (Telegram cevabı ancak böyle gelir)", async () => {
    await withTempGraphAsync(riskGraphFiles({ status: "pending" }), async (graph, dir) => {
      let resolveAsk: (v: string) => void = () => {};
      const notifier = {
        async send() {},
        ask(): Promise<string> {
          return new Promise<string>((r) => {
            resolveAsk = r;
          });
        },
        async edit() {},
      };
      let polls = 0;
      const outcome = await requestApproval({
        graph,
        graphRootDir: dir,
        config: ConfigSchema.parse(RISK_CONFIG),
        notifier,
        lang: "tr",
        node: graph.nodesById.get("E01-F01-T02")!,
        attempts: 0,
        lastError: "",
        kind: "risk",
        sleep: async () => {},
        pollIntervalMs: 60_000,
        poll: async () => {
          polls += 1;
          if (polls === 3) resolveAsk("skip");
        },
      });
      expect(outcome).toEqual({ nodeId: "E01-F01-T02", decision: "skip", timedOut: false });
      expect(polls).toBe(3);
      expect(matter(readFileSync(join(dir, "b.md"), "utf-8")).data.status).toBe("skipped");
    });
  });
});

describe("markBlocked / applyBlockedAnswer", () => {
  it("blocked → needs_decision + Hata geçmişi; 'retry' → pending", async () => {
    await withTempGraphAsync({ "a.md": frontmatter(TASK({ status: "running" })) }, async (graph, dir) => {
      const node = graph.nodesById.get("E01-F01-T01")!;
      markBlocked(graph, dir, node, "API anahtarı yok");
      let after = matter(readFileSync(join(dir, "a.md"), "utf-8"));
      expect(after.data.status).toBe("needs_decision");
      expect(after.content).toContain("E01-F01-T01 blocked: API anahtarı yok");

      expect(applyBlockedAnswer(graph, dir, node, "retry")).toBe("retry");
      after = matter(readFileSync(join(dir, "a.md"), "utf-8"));
      expect(after.data.status).toBe("pending");
    });
  });

  it("mimari karar seçeneği (opt:1) → seçim Hata geçmişi'ne 'karar (kullanıcı)' olarak yazılır, pending", async () => {
    await withTempGraphAsync({ "a.md": frontmatter(TASK({ status: "running" })) }, async (graph, dir) => {
      const node = graph.nodesById.get("E01-F01-T01")!;
      const question = { text: "Hangi veritabanı?", options: ["PostgreSQL", "SQLite"] };
      markBlocked(graph, dir, node, "veri modeli kararı", question);
      expect(applyBlockedAnswer(graph, dir, node, "opt:1", question)).toBe("retry");
      const after = matter(readFileSync(join(dir, "a.md"), "utf-8"));
      expect(after.data.status).toBe("pending");
      expect(after.content).toContain("E01-F01-T01 karar (kullanıcı): Hangi veritabanı? → SQLite");
    });
  });

  it("'skip' → skipped; 'stop' → pending (failed değil) ve stop döner", async () => {
    await withTempGraphAsync({ "a.md": frontmatter(TASK({ status: "needs_decision" })) }, async (graph, dir) => {
      const node = graph.nodesById.get("E01-F01-T01")!;
      expect(applyBlockedAnswer(graph, dir, node, "stop")).toBe("stop");
      expect(matter(readFileSync(join(dir, "a.md"), "utf-8")).data.status).toBe("pending");
      expect(applyBlockedAnswer(graph, dir, node, "skip")).toBe("skip");
      expect(matter(readFileSync(join(dir, "a.md"), "utf-8")).data.status).toBe("skipped");
    });
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

describe("autoBlockedAnswer", () => {
  it("soru yoksa skip; önerilen varsa o, yoksa ilk seçenek", () => {
    expect(autoBlockedAnswer()).toBe("skip");
    expect(autoBlockedAnswer({ text: "q", options: ["a", "b"], recommended: 1 })).toBe("opt:1");
    expect(autoBlockedAnswer({ text: "q", options: ["a", "b"] })).toBe("opt:0");
  });
});

describe("unblockDependents / retry", () => {
  it("failed görev 'retry' ile kuyruğa dönünce failNode'un blocked yaptığı bağımlıları pending olur", async () => {
    await withTempGraphAsync(
      {
        "a.md": frontmatter(TASK({ status: "failed" })),
        "b.md": frontmatter(TASK({ id: "E01-F01-T02", name: "b", status: "blocked", depends_on: ["E01-F01-T01"] })),
        "c.md": frontmatter(TASK({ id: "E01-F01-T03", name: "c", status: "blocked", depends_on: ["E01-F01-T09"] })),
      },
      async (graph, dir) => {
        await requestApproval({
          graph,
          graphRootDir: dir,
          config: ConfigSchema.parse(BASE_CONFIG),
          notifier: new MockNotifier({ answers: ["retry"] }),
          lang: "tr",
          node: graph.nodesById.get("E01-F01-T01")!,
          attempts: 1,
          lastError: "x",
        });
        expect(matter(readFileSync(join(dir, "b.md"), "utf-8")).data.status).toBe("pending");
        expect(matter(readFileSync(join(dir, "c.md"), "utf-8")).data.status).toBe("blocked");
      },
    );
  });
});
