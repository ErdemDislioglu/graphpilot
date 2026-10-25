import { readFileSync } from "node:fs";
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
