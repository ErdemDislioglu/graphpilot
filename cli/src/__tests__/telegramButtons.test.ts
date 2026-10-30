import { readFileSync } from "node:fs";
import { join } from "node:path";
import matter from "gray-matter";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runAutopilotLoop, type AutopilotStopReason } from "../autopilot/autopilotLoop.js";
import { RetryingNotifier } from "../autopilot/notifier.js";
import { TelegramClient, type TelegramUpdate } from "../autopilot/telegramClient.js";
import { TelegramNotifier } from "../autopilot/telegramNotifier.js";
import { TelegramPoller } from "../autopilot/telegramPoller.js";
import type { ClaudeHeadlessSpawner } from "../runModeB.js";
import { withTempGraphAsync } from "../testUtils/tempGraph.js";

/**
 * Pilot (versoApp, 2026-10-30): "Onayla"dan sonra otopilot çöktü — `answerCallbackQuery`
 * "query is too old" döndü, hata yakalanmıyordu. Burada GERÇEK Telegram katmanı
 * (`TelegramNotifier` + `TelegramPoller` + `RetryingNotifier`, üretimdeki gibi) sahte bir
 * Bot API'ye karşı çalışır; `answerCallbackQuery` HER ZAMAN o hatayı döner. Her akışın her
 * butonu basılır, sürecin düşmediği ve kararın uygulandığı doğrulanır.
 */
function fakeBotApi(presses: string[]) {
  let nextMessageId = 100;
  let updateId = 0;
  const queue: TelegramUpdate[] = [];
  const questions: { text: string; buttons: string[] }[] = [];
  const fetchFn = vi.fn(async (url: string, init: { body: string }) => {
    const method = url.split("/").pop();
    const body = JSON.parse(init.body) as Record<string, unknown>;
    const ok = (result: unknown) => ({ json: async () => ({ ok: true, result }) });
    if (method === "sendMessage") {
      const messageId = nextMessageId++;
      const markup = body.reply_markup as { inline_keyboard: { callback_data: string }[][] } | undefined;
      if (markup) {
        questions.push({ text: String(body.text), buttons: markup.inline_keyboard.map((row) => row[0].callback_data) });
        const data = presses.shift();
        if (data !== undefined) {
          queue.push({
            update_id: ++updateId,
            callback_query: { id: `cb-${messageId}`, data, from: { id: 1 }, message: { message_id: messageId, chat: { id: 7 } } },
          });
        }
      }
      return ok({ message_id: messageId, chat: { id: 7 } });
    }
    if (method === "getUpdates") return ok(queue.splice(0));
    if (method === "answerCallbackQuery") {
      return {
        json: async () => ({
          ok: false,
          error_code: 400,
          description: "Bad Request: query is too old and response timeout expired or query ID is invalid",
        }),
      };
    }
    return ok(true); // editMessageText
  });
  const client = new TelegramClient("TOKEN", fetchFn as unknown as typeof fetch);
  const poller = new TelegramPoller(client, 7);
  const notifier = new RetryingNotifier(
    new TelegramNotifier(client, 7, poller, { attempts: 1, waitMs: 0, sleep: async () => {} }),
  );
  return { poller, notifier, questions };
}

const CODER_MD = "---\ntools: Read,Edit,Write,Bash\n---\nSen bir coder agentısın.\n";
const CONFIG =
  "routing:\n  - when: {}\n    model: haiku\nescalation: [haiku, sonnet]\nmax_attempts_per_model: 1\n" +
  "budgets: { default_context: 8000, max_turns: 25 }\nteam: { enabled: false }\n" +
  "autopilot: { approvals: { on_risk_high: true } }\n";

function task(overrides: Record<string, unknown>): string {
  const base = {
    id: "E01-F01-T01",
    kind: "task",
    name: "token servisi",
    level: 3,
    summary: "s",
    type: "feature",
    complexity: "low",
    risk: "high",
    context_size: "small",
    model: "haiku",
    agent: "auto",
    context_budget: 8000,
    status: "pending",
    attempts: 0,
    ...overrides,
  };
  const lines = Object.entries(base).map(([k, v]) => `${k}: ${JSON.stringify(v)}`);
  return `---\n${lines.join("\n")}\n---\n## Görev\nx\n\n## Hata geçmişi\n\n*(yok)*\n`;
}

const json = (result: string) => ({ stdout: JSON.stringify({ result }), stderr: "", status: 0 });

async function run(opts: {
  presses: string[];
  approved?: boolean;
  spawner: ClaudeHeadlessSpawner;
}): Promise<{ stopReason: AutopilotStopReason; status: unknown; fm: Record<string, unknown>; body: string; questions: { text: string; buttons: string[] }[] }> {
  let out!: Awaited<ReturnType<typeof run>>;
  await withTempGraphAsync(
    {
      "a.md": task(opts.approved ? { approved: true } : {}),
      "config.yml": CONFIG,
      "coder.md": CODER_MD,
    },
    async (_graph, dir) => {
      const { poller, notifier, questions } = fakeBotApi([...opts.presses]);
      const result = await runAutopilotLoop({
        graphRootDir: dir,
        agentsDir: dir,
        notifier,
        poller,
        lang: "tr",
        spawner: opts.spawner,
        sleep: async () => {},
        shortRetrySleep: () => {},
      });
      const parsed = matter(readFileSync(join(dir, "a.md"), "utf-8"));
      out = { stopReason: result.stopReason, status: parsed.data.status, fm: parsed.data, body: parsed.content, questions };
    },
  );
  return out;
}

let unhandled: unknown[] = [];
const onUnhandled = (e: unknown) => unhandled.push(e);
beforeEach(() => {
  unhandled = [];
  process.on("unhandledRejection", onUnhandled);
});
afterEach(async () => {
  await new Promise((r) => setTimeout(r, 10));
  process.off("unhandledRejection", onUnhandled);
  expect(unhandled).toEqual([]); // "query is too old" süreci düşürmemeli
});

const okSpawner: ClaudeHeadlessSpawner = () => json("done");
function failThenOk(): ClaudeHeadlessSpawner {
  let calls = 0;
  return () => (++calls === 1 ? { stdout: "", stderr: "gerçek hata", status: 1 } : json("done"));
}
function blockedThenOk(): ClaudeHeadlessSpawner {
  let calls = 0;
  return () =>
    ++calls === 1
      ? json("blocked: token saklama kararı\nsoru: Token nerede saklansın?\nseçenek: Keychain\nseçenek: SecureStore (önerilen)")
      : json("done");
}

describe("Telegram butonları — risk onayı (answerCallbackQuery hata verse de)", () => {
  it("Onayla → görev çalışır, done", async () => {
    const r = await run({ presses: ["approve"], spawner: okSpawner });
    expect(r.questions[0].buttons).toEqual(["approve", "skip", "stop"]);
    expect(r).toMatchObject({ stopReason: "finished", status: "done" });
    expect(r.fm.approved).toBe(true);
  });

  it("Atla → görev skipped, otopilot biter", async () => {
    const r = await run({ presses: ["skip"], spawner: () => { throw new Error("çalışmamalı"); } });
    expect(r).toMatchObject({ stopReason: "finished", status: "skipped" });
  });

  it("Durdur → otopilot durur, görev pending kalır", async () => {
    const r = await run({ presses: ["stop"], spawner: () => { throw new Error("çalışmamalı"); } });
    expect(r).toMatchObject({ stopReason: "user_stop", status: "pending" });
  });
});

describe("Telegram butonları — başarısızlık onayı", () => {
  it("Tekrar dene → yeniden çalışır, done", async () => {
    const r = await run({ approved: true, presses: ["retry"], spawner: failThenOk() });
    expect(r.questions[0].buttons).toEqual(["retry", "escalate", "skip", "stop"]);
    expect(r).toMatchObject({ stopReason: "finished", status: "done" });
  });

  it("Üst modelle dene → model yükselir, done", async () => {
    const r = await run({ approved: true, presses: ["escalate"], spawner: failThenOk() });
    expect(r).toMatchObject({ stopReason: "finished", status: "done" });
    expect(r.fm.model).toBe("sonnet");
  });

  it("Atla → skipped, otopilot biter", async () => {
    const r = await run({ approved: true, presses: ["skip"], spawner: failThenOk() });
    expect(r).toMatchObject({ stopReason: "finished", status: "skipped" });
  });

  it("Durdur → otopilot durur, görev failed", async () => {
    const r = await run({ approved: true, presses: ["stop"], spawner: failThenOk() });
    expect(r).toMatchObject({ stopReason: "user_stop", status: "failed" });
  });
});

describe("Telegram butonları — blocked + mimari karar sorusu (risk: high)", () => {
  it("Seçenek butonu → karar Hata geçmişi'ne yazılır, görev yeniden çalışır, done", async () => {
    const r = await run({ approved: true, presses: ["opt:0"], spawner: blockedThenOk() });
    expect(r.questions[0].buttons).toEqual(["opt:0", "opt:1", "skip", "stop"]);
    expect(r).toMatchObject({ stopReason: "finished", status: "done" });
    expect(r.body).toContain("karar (kullanıcı): Token nerede saklansın? → Keychain");
  });

  it("Atla → skipped, otopilot biter", async () => {
    const r = await run({ approved: true, presses: ["skip"], spawner: blockedThenOk() });
    expect(r).toMatchObject({ stopReason: "finished", status: "skipped" });
  });

  it("Durdur → otopilot durur, görev pending (yeniden başlatınca tekrar denenir)", async () => {
    const r = await run({ approved: true, presses: ["stop"], spawner: blockedThenOk() });
    expect(r).toMatchObject({ stopReason: "user_stop", status: "pending" });
  });

  it("soru yoksa 'Tekrar dene' butonu → yeniden çalışır, done", async () => {
    let calls = 0;
    const spawner: ClaudeHeadlessSpawner = () => (++calls === 1 ? json("blocked: API anahtarı yok") : json("done"));
    const r = await run({ approved: true, presses: ["retry"], spawner });
    expect(r.questions[0].buttons).toEqual(["retry", "skip", "stop"]);
    expect(r).toMatchObject({ stopReason: "finished", status: "done" });
  });
});
