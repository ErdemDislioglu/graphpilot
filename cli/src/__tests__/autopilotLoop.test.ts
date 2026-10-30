import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import matter from "gray-matter";
import { describe, expect, it, vi } from "vitest";
import { runAutopilotLoop } from "../autopilot/autopilotLoop.js";
import { readEvents } from "../autopilot/eventBus.js";
import { MockNotifier } from "../autopilot/notifier.js";
import { TelegramClient } from "../autopilot/telegramClient.js";
import { TelegramPoller } from "../autopilot/telegramPoller.js";
import type { ClaudeHeadlessSpawner } from "../runModeB.js";
import { withTempGraphAsync } from "../testUtils/tempGraph.js";

const CONFIG_YML =
  "routing:\n  - when: {}\n    model: haiku\nescalation: [haiku]\nmax_attempts_per_model: 1\n" +
  "budgets: { default_context: 8000, max_turns: 25 }\n" +
  "mode_b: { rate_limit_retry: { enabled: true, wait_seconds: 1, max_retries: 1 } }\n" +
  "autopilot: { limits: { max_wait_hours: 12 } }\n";

const CODER_MD = "---\ntools: Read,Edit,Write,Bash\n---\nSen bir coder agentısın.\n";

function taskFrontmatter(overrides: Record<string, unknown>): string {
  const base = {
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
  };
  const lines = Object.entries(base).map(([k, v]) => `${k}: ${JSON.stringify(v)}`);
  return `---\n${lines.join("\n")}\n---\n## Görev\nx\n\n## Hata geçmişi\n\n*(yok)*\n`;
}

function offlinePoller(): TelegramPoller {
  // getUpdates hiçbir zaman gerçek ağa çıkmaz — her çağrı boş dizi döner (MockNotifier
  // bazlı testlerde poller sadece "/stop gibi komut var mı" diye sorulur, cevap hep hayır).
  const fetchFn = vi.fn().mockResolvedValue({ json: async () => ({ ok: true, result: [] }) });
  const client = new TelegramClient("TOKEN", fetchFn as unknown as typeof fetch);
  return new TelegramPoller(client, 7);
}

const instantSleep = async (): Promise<void> => {
  /* gerçekten beklemez */
};
const noopShortRetrySleep = (): void => {
  /* gerçekten beklemez (runNodeHeadlessWithRetry'nin kısa retry katmanı için) */
};

describe("runAutopilotLoop — mutlu yol (12.3/12.5)", () => {
  it("tek görevli epic: görev biter, epic_done VE finished mesajı gider, events.jsonl doğru sırada", async () => {
    await withTempGraphAsync(
      { "a.md": taskFrontmatter({}), "config.yml": CONFIG_YML, "coder.md": CODER_MD },
      async (_graph, dir) => {
        const notifier = new MockNotifier();
        const okSpawner: ClaudeHeadlessSpawner = () => ({ stdout: "{}", stderr: "", status: 0 });

        const result = await runAutopilotLoop({
          graphRootDir: dir,
          agentsDir: dir,
          notifier,
          poller: offlinePoller(),
          lang: "tr",
          spawner: okSpawner,
          sleep: instantSleep,
          shortRetrySleep: noopShortRetrySleep,
        });

        expect(result).toEqual({ processedCount: 1, stopReason: "finished" });
        expect(notifier.sent.some((m) => m.includes("tamamlandı") && m.startsWith("✅"))).toBe(true);
        expect(notifier.sent.some((m) => m.startsWith("🏁"))).toBe(true);

        const after = matter(readFileSync(join(dir, "a.md"), "utf-8"));
        expect(after.data.status).toBe("done");

        const eventTypes = readEvents(dir).map((e) => e.type);
        expect(eventTypes).toEqual(["node_done", "epic_done", "finished"]);
      },
    );
  });
});

describe("runAutopilotLoop — onay akışı (12.6)", () => {
  it("görev başarısız olur → needs_decision → 'retry' cevabıyla devam eder → biter", async () => {
    // team.enabled AÇIKÇA false — bu test Faz 12.6'nın GENEL (ekip modundan bağımsız)
    // başarısız-olunca-onay-akışı mekanizmasını hedefliyor. 2026-10-25'ten beri ekip
    // modu varsayılan AÇIK olduğu için, aksi halde bu tek başarısızlık doğrudan
    // `failNode`'a değil önce `escalateTeamNode`'a giderdi (kendi testi var, "ekip modu
    // entegrasyonu" — bu testin kapsamı o DEĞİL).
    await withTempGraphAsync(
      {
        "a.md": taskFrontmatter({}),
        "config.yml": CONFIG_YML + "team: { enabled: false }\n",
        "coder.md": CODER_MD,
      },
      async (_graph, dir) => {
        const notifier = new MockNotifier({ answers: ["retry"] });
        let calls = 0;
        const spawner: ClaudeHeadlessSpawner = () => {
          calls += 1;
          if (calls === 1) return { stdout: "", stderr: "gerçek bir hata (rate-limit değil)", status: 1 };
          return { stdout: "{}", stderr: "", status: 0 };
        };

        const result = await runAutopilotLoop({
          graphRootDir: dir,
          agentsDir: dir,
          notifier,
          poller: offlinePoller(),
          lang: "tr",
          spawner,
          sleep: instantSleep,
          shortRetrySleep: noopShortRetrySleep,
        });

        expect(result.stopReason).toBe("finished");
        expect(notifier.asked).toHaveLength(1);
        expect(notifier.asked[0].question).toContain("E01-F01-T01");

        const after = matter(readFileSync(join(dir, "a.md"), "utf-8"));
        expect(after.data.status).toBe("done");

        const eventTypes = readEvents(dir).map((e) => e.type);
        expect(eventTypes).toEqual([
          "failure",
          "needs_decision",
          "decision_answered",
          "node_done",
          "epic_done",
          "finished",
        ]);
      },
    );
  });
});

describe("runAutopilotLoop — limit bekleme ve otomatik devam (12.7)", () => {
  it("usage_limit sinyali: limit mesajı gider, beklenir, resume mesajı gider, SONRA AYNI görev başarıyla biter", async () => {
    await withTempGraphAsync(
      { "a.md": taskFrontmatter({}), "config.yml": CONFIG_YML, "coder.md": CODER_MD },
      async (_graph, dir) => {
        const notifier = new MockNotifier();
        let calls = 0;
        const spawner: ClaudeHeadlessSpawner = () => {
          calls += 1;
          if (calls <= 2) {
            // 1: ilk deneme, 2: Faz 9.2'nin kısa retry'ı (max_retries:1) — ikisi de limit.
            return { stdout: "", stderr: "You've hit your session limit.", status: 1 };
          }
          return { stdout: "{}", stderr: "", status: 0 }; // bekleme sonrası tekrar deneme: başarılı
        };

        const sleepCalls: number[] = [];
        const result = await runAutopilotLoop({
          graphRootDir: dir,
          agentsDir: dir,
          notifier,
          poller: offlinePoller(),
          lang: "tr",
          spawner,
          sleep: async (ms) => {
            sleepCalls.push(ms);
          },
          shortRetrySleep: noopShortRetrySleep,
          pollIntervalMs: 15_000,
        });

        expect(result).toEqual({ processedCount: 1, stopReason: "finished" });
        expect(calls).toBe(3);
        expect(sleepCalls.length).toBeGreaterThan(0);
        expect(sleepCalls.reduce((a, b) => a + b, 0)).toBe(60_000); // resetHint yok → ilk aralık 1dk

        expect(notifier.sent.some((m) => m.startsWith("⏸"))).toBe(true);
        expect(notifier.sent.some((m) => m.startsWith("▶️"))).toBe(true);

        const eventTypes = readEvents(dir).map((e) => e.type);
        expect(eventTypes).toEqual(["limit_hit", "resumed", "node_done", "epic_done", "finished"]);
      },
    );
  });

  it("spend_limit sinyali: beklemeden hemen durur (bekleyerek çözülmez)", async () => {
    await withTempGraphAsync(
      { "a.md": taskFrontmatter({}), "config.yml": CONFIG_YML, "coder.md": CODER_MD },
      async (_graph, dir) => {
        const notifier = new MockNotifier();
        const spawner: ClaudeHeadlessSpawner = () => ({
          stdout: "",
          stderr: "You've hit your monthly spend limit.",
          status: 1,
        });
        const sleepCalls: number[] = [];

        const result = await runAutopilotLoop({
          graphRootDir: dir,
          agentsDir: dir,
          notifier,
          poller: offlinePoller(),
          lang: "tr",
          spawner,
          sleep: async (ms) => {
            sleepCalls.push(ms);
          },
          shortRetrySleep: noopShortRetrySleep,
        });

        expect(result).toEqual({ processedCount: 0, stopReason: "spend_limit" });
        expect(sleepCalls).toEqual([]); // hiç beklenmedi
        expect(notifier.sent.some((m) => m.includes("Harcama limiti"))).toBe(true);

        const after = matter(readFileSync(join(dir, "a.md"), "utf-8"));
        expect(after.data.status).toBe("running"); // güvenli noktada durdu, failed SAYILMADI
      },
    );
  });
});

describe("runAutopilotLoop — süreç yeniden başlatma (12.10/12.11)", () => {
  it("maxNodes:1 ile durdurulan süreç, AYNI dizinle tekrar başlatılınca kaldığı yerden devam eder", async () => {
    await withTempGraphAsync(
      {
        "a.md": taskFrontmatter({ id: "E01-F01-T01", name: "a" }),
        "b.md": taskFrontmatter({ id: "E01-F01-T02", name: "b", depends_on: [] }),
        "config.yml": CONFIG_YML,
        "coder.md": CODER_MD,
      },
      async (_graph, dir) => {
        const okSpawner: ClaudeHeadlessSpawner = () => ({ stdout: "{}", stderr: "", status: 0 });

        const first = await runAutopilotLoop({
          graphRootDir: dir,
          agentsDir: dir,
          notifier: new MockNotifier(),
          poller: offlinePoller(),
          lang: "tr",
          spawner: okSpawner,
          sleep: instantSleep,
          shortRetrySleep: noopShortRetrySleep,
          maxNodes: 1,
        });
        expect(first).toEqual({ processedCount: 1, stopReason: "finished" });

        // "Süreç öldü" simülasyonu: yeni bir runAutopilotLoop çağrısı (yeni "süreç"),
        // AYNI graphRootDir ile — hiçbir ek state aktarılmıyor, sadece dosyalar.
        const second = await runAutopilotLoop({
          graphRootDir: dir,
          agentsDir: dir,
          notifier: new MockNotifier(),
          poller: offlinePoller(),
          lang: "tr",
          spawner: okSpawner,
          sleep: instantSleep,
          shortRetrySleep: noopShortRetrySleep,
        });
        expect(second).toEqual({ processedCount: 1, stopReason: "finished" });

        const a = matter(readFileSync(join(dir, "a.md"), "utf-8"));
        const b = matter(readFileSync(join(dir, "b.md"), "utf-8"));
        expect(a.data.status).toBe("done");
        expect(b.data.status).toBe("done");
      },
    );
  });
});

describe("runAutopilotLoop — /stop komutu (12.8)", () => {
  it("ilk pollOnce()'ta /stop gelirse hiçbir düğüm işlenmeden durur", async () => {
    await withTempGraphAsync(
      { "a.md": taskFrontmatter({}), "config.yml": CONFIG_YML, "coder.md": CODER_MD },
      async (_graph, dir) => {
        const fetchFn = vi.fn().mockResolvedValueOnce({
          json: async () => ({
            ok: true,
            result: [{ update_id: 1, message: { message_id: 1, chat: { id: 7 }, text: "/stop" } }],
          }),
        });
        const client = new TelegramClient("TOKEN", fetchFn as unknown as typeof fetch);
        const poller = new TelegramPoller(client, 7);
        const notifier = new MockNotifier();
        const spawner: ClaudeHeadlessSpawner = () => {
          throw new Error("/stop işlenmeden görev çalıştırılmamalıydı");
        };

        const result = await runAutopilotLoop({
          graphRootDir: dir,
          agentsDir: dir,
          notifier,
          poller,
          lang: "tr",
          spawner,
          sleep: instantSleep,
          shortRetrySleep: noopShortRetrySleep,
        });

        expect(result).toEqual({ processedCount: 0, stopReason: "user_stop" });
        expect(notifier.sent.some((m) => m.includes("durdurma"))).toBe(true);
      },
    );
  });
});

describe("runAutopilotLoop — quiet_hours (12.2/12.5)", () => {
  it("sessiz saatte rutin epic_done mesajı ATLANIR ama 'finished' (kritik) her zaman gider", async () => {
    const QUIET_CONFIG_YML =
      "routing:\n  - when: {}\n    model: haiku\nescalation: [haiku]\nmax_attempts_per_model: 1\n" +
      "budgets: { default_context: 8000, max_turns: 25 }\n" +
      "mode_b: { rate_limit_retry: { enabled: true, wait_seconds: 1, max_retries: 1 } }\n" +
      'autopilot: { limits: { max_wait_hours: 12 }, quiet_hours: "00:00-23:59" }\n';

    await withTempGraphAsync(
      { "a.md": taskFrontmatter({}), "config.yml": QUIET_CONFIG_YML, "coder.md": CODER_MD },
      async (_graph, dir) => {
        const notifier = new MockNotifier();
        const okSpawner: ClaudeHeadlessSpawner = () => ({ stdout: "{}", stderr: "", status: 0 });

        const result = await runAutopilotLoop({
          graphRootDir: dir,
          agentsDir: dir,
          notifier,
          poller: offlinePoller(),
          lang: "tr",
          spawner: okSpawner,
          sleep: instantSleep,
          shortRetrySleep: noopShortRetrySleep,
          now: () => new Date("2026-10-24T03:00:00").getTime(), // 00:00-23:59 penceresinin içinde
        });

        expect(result).toEqual({ processedCount: 1, stopReason: "finished" });
        // epic_done (rutin) sessiz saatte gitmemeli:
        expect(notifier.sent.some((m) => m.startsWith("✅"))).toBe(false);
        // finished (kritik) her zaman gitmeli:
        expect(notifier.sent.some((m) => m.startsWith("🏁"))).toBe(true);
      },
    );
  });
});

describe("runAutopilotLoop — ekip modu entegrasyonu (Faz 13.3/13.5)", () => {
  it("junior(haiku) başarısız → junior(sonnet) başarısız → senior başarılı; mis_tagged kaydedilir", async () => {
    const TEAM_CONFIG_YML =
      "routing:\n  - when: {}\n    model: haiku\nescalation: [haiku]\nmax_attempts_per_model: 1\n" +
      "budgets: { default_context: 8000, max_turns: 25 }\n" +
      "mode_b: { rate_limit_retry: { enabled: true, wait_seconds: 1, max_retries: 1 } }\n" +
      "team: { enabled: true }\n";

    await withTempGraphAsync(
      {
        "a.md": taskFrontmatter({ complexity: "low" }),
        "config.yml": TEAM_CONFIG_YML,
        "coder.md": CODER_MD,
        "senior.md": CODER_MD,
      },
      async (_graph, dir) => {
        const notifier = new MockNotifier();
        let calls = 0;
        const spawner: ClaudeHeadlessSpawner = () => {
          calls += 1;
          // "gerçek hata" rate-limit sinyali DEĞİL → kısa retry katmanı (Faz 9.2) hiç
          // devreye girmez, her basamak TEK çağrı tüketir: 1=junior(haiku) başarısız,
          // 2=junior(sonnet) başarısız, 3=senior başarılı.
          if (calls <= 2) return { stdout: "", stderr: "gerçek hata (rate-limit değil)", status: 1 };
          return { stdout: "{}", stderr: "", status: 0 };
        };

        const result = await runAutopilotLoop({
          graphRootDir: dir,
          agentsDir: dir,
          notifier,
          poller: offlinePoller(),
          lang: "tr",
          spawner,
          sleep: instantSleep,
          shortRetrySleep: noopShortRetrySleep,
        });

        expect(result).toEqual({ processedCount: 1, stopReason: "finished" });

        const after = matter(readFileSync(join(dir, "a.md"), "utf-8"));
        expect(after.data.status).toBe("done");
        expect(after.data.assignee).toBe("senior");

        const eventTypes = readEvents(dir).map((e) => e.type);
        expect(eventTypes.filter((t) => t === "escalated")).toHaveLength(2);
      },
    );
  });
});

describe("runAutopilotLoop — /questions ve 4 saatlik hatırlatma (Faz 13.9/13.10)", () => {
  it("needs_decision bekliyorsa: bir kez 'bekliyorum', sonra zaman geçince hatırlatma; /questions listeler", async () => {
    await withTempGraphAsync(
      { "a.md": taskFrontmatter({ status: "needs_decision" }), "config.yml": CONFIG_YML, "coder.md": CODER_MD },
      async (_graph, dir) => {
        const notifier = new MockNotifier();
        let fakeNow = 0;
        let pollCount = 0;
        const fetchFn = vi.fn().mockImplementation(async () => {
          pollCount += 1;
          if (pollCount === 5) {
            return {
              json: async () => ({
                ok: true,
                result: [{ update_id: 1, message: { message_id: 1, chat: { id: 7 }, text: "/questions" } }],
              }),
            };
          }
          if (pollCount === 25) {
            return {
              json: async () => ({
                ok: true,
                result: [{ update_id: 2, message: { message_id: 2, chat: { id: 7 }, text: "/stop" } }],
              }),
            };
          }
          return { json: async () => ({ ok: true, result: [] }) };
        });
        const client = new TelegramClient("TOKEN", fetchFn as unknown as typeof fetch);
        const poller = new TelegramPoller(client, 7);

        const result = await runAutopilotLoop({
          graphRootDir: dir,
          agentsDir: dir,
          notifier,
          poller,
          lang: "tr",
          spawner: () => {
            throw new Error("hazır düğüm yok, hiçbir şey çalıştırılmamalı");
          },
          sleep: instantSleep,
          shortRetrySleep: noopShortRetrySleep,
          now: () => {
            fakeNow += 20 * 60_000; // her çağrıda +20 dakika
            return fakeNow;
          },
        });

        expect(result.stopReason).toBe("user_stop");

        const waitingMsg = notifier.sent.filter((m) => m.includes("bekliyorum"));
        expect(waitingMsg).toHaveLength(1); // sadece BİR KEZ

        const reminders = notifier.sent.filter((m) => m.includes("karar bekliyor."));
        expect(reminders.length).toBeGreaterThanOrEqual(1); // en az bir periyodik hatırlatma

        const questionsAnswer = notifier.sent.find((m) => m.includes("E01-F01-T01"));
        expect(questionsAnswer).toBeTruthy();
      },
    );
  });
});

describe("runAutopilotLoop — Telegram'dan /run <EPIC> (Faz 12.13)", () => {
  const RUN_CONFIG_YML =
    "routing:\n  - when: {}\n    model: haiku\nescalation: [haiku]\nmax_attempts_per_model: 1\n" +
    "budgets: { default_context: 8000, max_turns: 25 }\n" +
    "mode_b: { rate_limit_retry: { enabled: true, wait_seconds: 1, max_retries: 1 } }\n" +
    "team: { enabled: false }\n" +
    'autopilot: { scope: "epic:E01", idle_wait: true, ' +
    "git: { commit: true, branch_per_epic: true, push_on_epic_done: true } }\n";
  const fm = (obj: Record<string, unknown>): string =>
    `---\n${Object.entries(obj)
      .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
      .join("\n")}\n---\n`;
  const epic = (id: string, expanded: boolean) =>
    fm({
      id,
      kind: "epic",
      name: `${id}-tasarim`,
      summary: "s",
      status: "pending",
      expanded,
      depends_on: [],
    });
  const feature = (id: string) =>
    fm({
      id,
      kind: "feature",
      name: `${id}-f`,
      summary: "s",
      status: "pending",
      expanded: true,
      depends_on: [],
    });

  it("bitmiş kapsamda bekler, /run e02 ile dal açar, epic'i genişletir, görevi commit'ler, push'lar ve tekrar bekler", async () => {
    await withTempGraphAsync(
      {
        "e1.md": epic("E01", true),
        "f1.md": feature("E01-F01"),
        "t1.md": taskFrontmatter({ status: "done" }),
        "e2.md": epic("E02", false),
        "config.yml": RUN_CONFIG_YML,
        "coder.md": CODER_MD,
        "planner.md": "---\ntools: Read,Bash\n---\nSen planner'sın.\n",
      },
      async (_graph, dir) => {
        const notifier = new MockNotifier();
        let polls = 0;
        const message = (text: string) => ({
          json: async () => ({
            ok: true,
            result: [{ update_id: polls, message: { message_id: polls, chat: { id: 7 }, text } }],
          }),
        });
        const empty = { json: async () => ({ ok: true, result: [] }) };
        const fetchFn = vi.fn().mockImplementation(async () => {
          polls += 1;
          if (polls > 200) return message("/stop"); // güvenlik: döngü takılırsa test asılı kalmasın
          const idleNotices = notifier.sent.filter((m) => m.startsWith("🏁")).length;
          if (idleNotices === 1 && !notifier.sent.some((m) => m.startsWith("▶️")))
            return message("/run e02");
          if (idleNotices === 2) return message("/stop");
          return empty;
        });
        const poller = new TelegramPoller(
          new TelegramClient("TOKEN", fetchFn as unknown as typeof fetch),
          7,
        );

        const prompts: string[] = [];
        const spawner: ClaudeHeadlessSpawner = (args) => {
          const prompt = args[1];
          prompts.push(prompt);
          if (prompt.startsWith("MOD: GENİŞLETME-FEATURE")) {
            // Sahte planner: E02'yi bir feature + bir task ile açar.
            writeFileSync(join(dir, "e2.md"), epic("E02", true));
            writeFileSync(join(dir, "f2.md"), feature("E02-F01"));
            writeFileSync(
              join(dir, "t2.md"),
              taskFrontmatter({ id: "E02-F01-T01", name: "b", summary: "yeni görev" }),
            );
          }
          return { stdout: "{}", stderr: "", status: 0 };
        };
        const gitCalls: string[] = [];
        const git = (args: string[]) => {
          const key = args.join(" ");
          gitCalls.push(key);
          if (key === "rev-parse --is-inside-work-tree") return { stdout: "true\n", status: 0 };
          if (key === "rev-parse --abbrev-ref HEAD") return { stdout: "main\n", status: 0 };
          if (key === "checkout -q feature/E02-tasarim") return { stdout: "", status: 1 };
          if (key === "diff --cached --quiet") return { stdout: "", status: 1 };
          return { stdout: "", status: 0 };
        };

        const result = await runAutopilotLoop({
          graphRootDir: dir,
          agentsDir: dir,
          notifier,
          poller,
          lang: "tr",
          spawner,
          sleep: instantSleep,
          shortRetrySleep: noopShortRetrySleep,
          projectRoot: "/proje",
          git,
        });

        expect(result).toEqual({ processedCount: 1, stopReason: "user_stop" });
        expect(prompts.map((p) => p.split("\n")[0])).toEqual([
          "MOD: GENİŞLETME-FEATURE",
          expect.any(String),
        ]);
        expect(notifier.sent).toEqual(
          expect.arrayContaining([
            "🏁 epic:E01 tamamlandı. Sıradaki için /run <EPIC> yaz (liste: /epics).",
            "▶️ E02 başlatılıyor · dal: feature/E02-tasarim",
            "🧩 E02 görevlere bölündü.",
            "🏁 epic:E02 tamamlandı. Sıradaki için /run <EPIC> yaz (liste: /epics).",
          ]),
        );
        expect(
          notifier.sent.some((m) => m.startsWith("✅ E02") && m.endsWith("⬆️ dal push'landı")),
        ).toBe(true);
        expect(gitCalls).toEqual(
          expect.arrayContaining([
            "checkout -q -b feature/E02-tasarim",
            "commit -q -m gp(E02-F01-T01): yeni görev",
            "push -q -u origin HEAD",
          ]),
        );
        const task = matter(readFileSync(join(dir, "t2.md"), "utf-8"));
        expect(task.data.status).toBe("done");
      },
    );
  });

  it("/run'a geçersiz epic verilirse uyarır ve hiçbir şey başlatmaz; /epics ve /help cevaplanır", async () => {
    await withTempGraphAsync(
      {
        "e1.md": epic("E01", true),
        "f1.md": feature("E01-F01"),
        "t1.md": taskFrontmatter({ status: "done" }),
        "config.yml": RUN_CONFIG_YML,
        "coder.md": CODER_MD,
      },
      async (_graph, dir) => {
        const notifier = new MockNotifier();
        const script = ["/run E99", "/run E01", "/epics", "/help", "/stop"];
        let i = 0;
        const fetchFn = vi.fn().mockImplementation(async () => {
          const text = i > 200 ? "/stop" : script[i];
          i += 1;
          return {
            json: async () => ({
              ok: true,
              result: text
                ? [{ update_id: i, message: { message_id: i, chat: { id: 7 }, text } }]
                : [],
            }),
          };
        });
        const poller = new TelegramPoller(
          new TelegramClient("TOKEN", fetchFn as unknown as typeof fetch),
          7,
        );
        const spawner: ClaudeHeadlessSpawner = () => {
          throw new Error("hiçbir agent çalıştırılmamalıydı");
        };

        const result = await runAutopilotLoop({
          graphRootDir: dir,
          agentsDir: dir,
          notifier,
          poller,
          lang: "tr",
          spawner,
          sleep: instantSleep,
          shortRetrySleep: noopShortRetrySleep,
        });

        expect(result.stopReason).toBe("user_stop");
        expect(notifier.sent).toContain("⚠️ Epic bulunamadı: E99 (liste: /epics)");
        expect(notifier.sent).toContain("⚠️ E01 zaten tamamlandı.");
        expect(notifier.sent.some((m) => m.startsWith("📚 Epic'ler:\n✅ E01"))).toBe(true);
        expect(notifier.sent.some((m) => m.startsWith("🤖 Komutlar:"))).toBe(true);
        expect(notifier.sent.some((m) => m.startsWith("▶️"))).toBe(false);
      },
    );
  });
});

describe("runAutopilotLoop — risk: high onayı (12.6 düzeltmesi)", () => {
  it("aynı risk:high görev iki turda iki kez sorulmaz; done risk:high görev hiç sorulmaz", async () => {
    await withTempGraphAsync(
      {
        "a.md": taskFrontmatter({ risk: "high" }),
        "b.md": taskFrontmatter({ id: "E01-F01-T02", name: "b", depends_on: ["E01-F01-T01"] }),
        "c.md": taskFrontmatter({ id: "E01-F01-T03", name: "c", risk: "high", status: "done" }),
        "config.yml":
          "routing:\n  - when: {}\n    model: haiku\nescalation: [haiku]\nmax_attempts_per_model: 1\n" +
          "budgets: { default_context: 8000, max_turns: 25 }\nteam: { enabled: false }\n" +
          "autopilot: { approvals: { on_risk_high: true } }\n",
        "coder.md": CODER_MD,
      },
      async (_graph, dir) => {
        const notifier = new MockNotifier({ answers: ["approve"] });
        const result = await runAutopilotLoop({
          graphRootDir: dir,
          agentsDir: dir,
          notifier,
          poller: offlinePoller(),
          lang: "tr",
          spawner: () => ({ stdout: JSON.stringify({ result: "done" }), stderr: "", status: 0 }),
          sleep: instantSleep,
          shortRetrySleep: noopShortRetrySleep,
        });

        expect(result).toEqual({ processedCount: 2, stopReason: "finished" });
        expect(notifier.asked).toHaveLength(1);
        expect(notifier.asked[0].question).toContain('E01-F01-T01 "a" riskli (risk: high)');
        const after = matter(readFileSync(join(dir, "a.md"), "utf-8"));
        expect(after.data.status).toBe("done");
        expect(after.data.approved).toBe(true);
      },
    );
  });
});

describe("runAutopilotLoop — agent 'blocked:' dönüşü (Faz 12)", () => {
  it("risk: high blocked → needs_decision, escalation/commit yok, bağımsız görev sürer; 'retry' ile tekrar çalışır", async () => {
    await withTempGraphAsync(
      {
        "a.md": taskFrontmatter({ risk: "high" }),
        "b.md": taskFrontmatter({ id: "E01-F01-T02", name: "b" }),
        "config.yml":
          "routing:\n  - when: {}\n    model: haiku\nescalation: [haiku]\nmax_attempts_per_model: 1\n" +
          "budgets: { default_context: 8000, max_turns: 25 }\nteam: { enabled: true }\n" +
          "autopilot: { git: { commit: true } }\n",
        "coder.md": CODER_MD,
      },
      async (_graph, dir) => {
        let answer: (v: string) => void = () => {};
        const asked: string[] = [];
        const notifier = {
          sent: [] as string[],
          async send(m: string) {
            this.sent.push(m);
          },
          ask(q: string): Promise<string> {
            asked.push(q);
            return new Promise<string>((r) => {
              answer = r;
            });
          },
          async edit() {},
        };
        const commits: string[] = [];
        const git = (args: string[]) => {
          if (args[0] === "commit") commits.push(args.join(" "));
          if (args.join(" ") === "rev-parse --is-inside-work-tree") return { stdout: "true\n", status: 0 };
          if (args.join(" ") === "diff --cached --quiet") return { stdout: "", status: 1 };
          return { stdout: "", status: 0 };
        };
        const runs: string[] = [];
        let t01Runs = 0;
        const spawner: ClaudeHeadlessSpawner = (args) => {
          // Epic indeksi kardeş ID'leri de içerir — görevin kendi frontmatter satırına bak.
          const isT01 = args[1].includes('id: "E01-F01-T01"');
          runs.push(isT01 ? "T01" : "T02");
          if (isT01 && ++t01Runs === 1) {
            return { stdout: JSON.stringify({ result: "Denedim.\nblocked: API anahtarı yok" }), stderr: "", status: 0 };
          }
          if (!isT01) {
            // Bağımsız görev çalışırken T01 kararını bekliyor; commit atılmamış.
            expect(matter(readFileSync(join(dir, "a.md"), "utf-8")).data.status).toBe("needs_decision");
            expect(commits).toHaveLength(0);
            answer("retry");
          }
          return { stdout: JSON.stringify({ result: "done" }), stderr: "", status: 0 };
        };

        const result = await runAutopilotLoop({
          graphRootDir: dir,
          agentsDir: dir,
          notifier,
          poller: offlinePoller(),
          lang: "tr",
          spawner,
          git,
          sleep: instantSleep,
          shortRetrySleep: noopShortRetrySleep,
        });

        expect(result).toEqual({ processedCount: 2, stopReason: "finished" });
        expect(runs).toEqual(["T01", "T02", "T01"]);
        expect(asked).toEqual(["⛔ E01-F01-T01 durdu: API anahtarı yok. Karar gerekiyor."]);
        expect(commits).toHaveLength(2); // T02 ve tekrar denenen T01 — blocked turda değil
        const eventTypes = readEvents(dir).map((e) => e.type);
        expect(eventTypes).not.toContain("escalated");
        expect(eventTypes).not.toContain("failure");
        const after = matter(readFileSync(join(dir, "a.md"), "utf-8"));
        expect(after.data.status).toBe("done");
        expect(after.data.assignee ?? "auto").toBe("auto");
        expect(after.content).toContain("E01-F01-T01 blocked: API anahtarı yok");
      },
    );
  });

  it("risk: high görevde mimari karar sorusu: seçenekler buton olur, seçim Hata geçmişi'ne yazılıp görev yeniden çalışır", async () => {
    await withTempGraphAsync(
      {
        "a.md": taskFrontmatter({ risk: "high" }),
        "config.yml":
          "routing:\n  - when: {}\n    model: haiku\nescalation: [haiku]\nmax_attempts_per_model: 1\n" +
          "budgets: { default_context: 8000, max_turns: 25 }\nteam: { enabled: false }\n",
        "coder.md": CODER_MD,
      },
      async (_graph, dir) => {
        const notifier = new MockNotifier({ answers: ["opt:0"] });
        const contexts: string[] = [];
        const spawner: ClaudeHeadlessSpawner = (args) => {
          contexts.push(args[1]);
          if (contexts.length === 1) {
            const result = "blocked: veri modeli kararı\nsoru: Hangi veritabanı?\nseçenek: PostgreSQL\nseçenek: SQLite";
            return { stdout: JSON.stringify({ result }), stderr: "", status: 0 };
          }
          return { stdout: JSON.stringify({ result: "done" }), stderr: "", status: 0 };
        };

        const result = await runAutopilotLoop({
          graphRootDir: dir,
          agentsDir: dir,
          notifier,
          poller: offlinePoller(),
          lang: "tr",
          spawner,
          sleep: instantSleep,
          shortRetrySleep: noopShortRetrySleep,
        });

        expect(result.stopReason).toBe("finished");
        expect(notifier.asked[0].question).toContain("❓ Hangi veritabanı?");
        expect(notifier.asked[0].options.map((o) => o.value)).toEqual(["opt:0", "opt:1", "skip", "stop"]);
        // Yeniden çalışan agent kararı bağlam paketinde (kendi düğüm gövdesi) görür.
        expect(contexts[1]).toContain("karar (kullanıcı): Hangi veritabanı? → PostgreSQL");
      },
    );
  });
});

describe("runAutopilotLoop — risk'i high olmayan blocked görev sorulmaz (kullanıcı isteği)", () => {
  const CFG =
    "routing:\n  - when: {}\n    model: haiku\nescalation: [haiku]\nmax_attempts_per_model: 1\n" +
    "budgets: { default_context: 8000, max_turns: 25 }\nteam: { enabled: false }\n";

  it("soru varsa (önerilen) seçenek otomatik seçilir, görev yeniden çalışır, Telegram'a yalnız bilgi gider", async () => {
    await withTempGraphAsync({ "a.md": taskFrontmatter({ risk: "med" }), "config.yml": CFG, "coder.md": CODER_MD }, async (_graph, dir) => {
      const notifier = new MockNotifier();
      const contexts: string[] = [];
      const spawner: ClaudeHeadlessSpawner = (args) => {
        contexts.push(args[1]);
        const result =
          contexts.length === 1
            ? "blocked: veri modeli kararı\nsoru: Hangi veritabanı?\nseçenek: PostgreSQL\nseçenek: SQLite (önerilen)"
            : "done";
        return { stdout: JSON.stringify({ result }), stderr: "", status: 0 };
      };
      const result = await runAutopilotLoop({
        graphRootDir: dir,
        agentsDir: dir,
        notifier,
        poller: offlinePoller(),
        lang: "tr",
        spawner,
        sleep: instantSleep,
        shortRetrySleep: noopShortRetrySleep,
      });
      expect(result.stopReason).toBe("finished");
      expect(notifier.asked).toHaveLength(0);
      expect(notifier.sent).toContain("⛔ E01-F01-T01 durdu: veri modeli kararı. Otomatik karar — önerilen seçildi: SQLite.");
      expect(contexts[1]).toContain("karar (otomatik): Hangi veritabanı? → SQLite");
    });
  });

  it("soru yoksa görev atlanır, hiç soru sorulmaz", async () => {
    await withTempGraphAsync({ "a.md": taskFrontmatter({}), "config.yml": CFG, "coder.md": CODER_MD }, async (_graph, dir) => {
      const notifier = new MockNotifier();
      // `skipped` görev "bitti" sayılmadığı için döngü kendiliğinden bitmez — 3. turda /stop.
      let polls = 0;
      const fetchFn = vi.fn().mockImplementation(async () => {
        polls += 1;
        const result = polls === 3 ? [{ update_id: 1, message: { message_id: 1, chat: { id: 7 }, text: "/stop" } }] : [];
        return { json: async () => ({ ok: true, result }) };
      });
      const poller = new TelegramPoller(new TelegramClient("TOKEN", fetchFn as unknown as typeof fetch), 7);
      const result = await runAutopilotLoop({
        graphRootDir: dir,
        agentsDir: dir,
        notifier,
        poller,
        lang: "tr",
        spawner: () => ({ stdout: JSON.stringify({ result: "blocked: API anahtarı yok" }), stderr: "", status: 0 }),
        sleep: instantSleep,
        shortRetrySleep: noopShortRetrySleep,
      });
      expect(result.stopReason).toBe("user_stop");
      expect(notifier.asked).toHaveLength(0);
      expect(matter(readFileSync(join(dir, "a.md"), "utf-8")).data.status).toBe("skipped");
      expect(notifier.sent[0]).toBe("⛔ E01-F01-T01 durdu: API anahtarı yok. Otomatik karar — atlandı.");
    });
  });
});
