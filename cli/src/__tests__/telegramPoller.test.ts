import { describe, expect, it, vi } from "vitest";
import { TelegramClient, type TelegramUpdate } from "../autopilot/telegramClient.js";
import { TelegramPoller } from "../autopilot/telegramPoller.js";

function clientReturning(updates: TelegramUpdate[]): TelegramClient {
  const fetchFn = vi
    .fn()
    .mockResolvedValueOnce({ json: async () => ({ ok: true, result: updates }) })
    .mockResolvedValue({ json: async () => ({ ok: true, result: [] }) });
  return new TelegramClient("TOKEN", fetchFn as unknown as typeof fetch);
}

describe("TelegramPoller", () => {
  it("izinli chat'ten gelen callback_query, registerAsk ile bekleyen Promise'i çözer", async () => {
    const client = clientReturning([
      {
        update_id: 1,
        callback_query: {
          id: "cb-1",
          data: "retry",
          from: { id: 999 },
          message: { message_id: 42, chat: { id: 7 } },
        },
      },
    ]);
    const poller = new TelegramPoller(client, 7);
    const answer = poller.registerAsk(42);
    await poller.pollOnce();
    expect(await answer).toBe("retry");
  });

  it("yetkisiz chat ID'den gelen callback_query sessizce yok sayılır (12.9)", async () => {
    const client = clientReturning([
      {
        update_id: 1,
        callback_query: {
          id: "cb-1",
          data: "retry",
          from: { id: 999 },
          message: { message_id: 42, chat: { id: 666 } },
        },
      },
    ]);
    const poller = new TelegramPoller(client, 7);
    const answer = poller.registerAsk(42);
    await poller.pollOnce();
    let resolved = false;
    void answer.then(() => {
      resolved = true;
    });
    await Promise.resolve();
    expect(resolved).toBe(false);
  });

  it("aynı callback_query.id iki kez gelirse ikinci eylem üretmez (12.9 idempotentlik)", async () => {
    const dup: TelegramUpdate = {
      update_id: 1,
      callback_query: { id: "cb-1", data: "retry", from: { id: 999 }, message: { message_id: 42, chat: { id: 7 } } },
    };
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce({ json: async () => ({ ok: true, result: [dup] }) })
      .mockResolvedValueOnce({ json: async () => ({ ok: true, result: [{ ...dup, update_id: 2 }] }) })
      .mockResolvedValue({ json: async () => ({ ok: true, result: [] }) });
    const client = new TelegramClient("TOKEN", fetchFn as unknown as typeof fetch);
    const poller = new TelegramPoller(client, 7);
    const answers: string[] = [];
    poller.registerAsk(42);
    await poller.pollOnce();
    // İlk tur çözüldü (waiter kaldırıldı). İkinci tur AYNI callback_query.id ile gelirse
    // (Telegram'ın kendi tekrarı ya da hızlı çift tıklama) answerCallbackQuery tekrar
    // çağrılmamalı — toplam çağrı sayısı 1 kalmalı.
    await poller.pollOnce();
    const answerCallbackCalls = (fetchFn.mock.calls as [string, unknown][]).filter(([url]) =>
      url.endsWith("/answerCallbackQuery"),
    );
    expect(answerCallbackCalls).toHaveLength(1);
    expect(answers).toEqual([]);
  });

  it("/ ile başlayan komut mesajı onCommandMessage handler'ına iletilir", async () => {
    const client = clientReturning([
      { update_id: 1, message: { message_id: 1, chat: { id: 7 }, text: "/status" } },
    ]);
    const poller = new TelegramPoller(client, 7);
    const handler = vi.fn();
    poller.onCommandMessage(handler);
    await poller.pollOnce();
    expect(handler).toHaveBeenCalledWith(7, "/status", "");
  });

  it("serbest metin (/ ile başlamayan) hiçbir zaman komut olarak çalıştırılmaz (12.8)", async () => {
    const client = clientReturning([
      { update_id: 1, message: { message_id: 1, chat: { id: 7 }, text: "merhaba bot" } },
    ]);
    const poller = new TelegramPoller(client, 7);
    const handler = vi.fn();
    poller.onCommandMessage(handler);
    await poller.pollOnce();
    expect(handler).not.toHaveBeenCalled();
  });

  it("yetkisiz chat'ten gelen komut mesajı yok sayılır (12.9)", async () => {
    const client = clientReturning([
      { update_id: 1, message: { message_id: 1, chat: { id: 666 }, text: "/stop" } },
    ]);
    const poller = new TelegramPoller(client, 7);
    const handler = vi.fn();
    poller.onCommandMessage(handler);
    await poller.pollOnce();
    expect(handler).not.toHaveBeenCalled();
  });

  it("offset işlenen en yüksek update_id + 1'e ilerler (tekrar işlenmesin)", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce({
        json: async () => ({
          ok: true,
          result: [{ update_id: 5, message: { message_id: 1, chat: { id: 7 }, text: "/status" } }],
        }),
      })
      .mockResolvedValue({ json: async () => ({ ok: true, result: [] }) });
    const client = new TelegramClient("TOKEN", fetchFn as unknown as typeof fetch);
    const poller = new TelegramPoller(client, 7);
    await poller.pollOnce();
    await poller.pollOnce();
    const secondCallBody = JSON.parse((fetchFn.mock.calls[1][1] as RequestInit & { body: string }).body);
    expect(secondCallBody.offset).toBe(6);
  });
});

describe("TelegramPoller — ağ hatası (Faz 12.13)", () => {
  it("getUpdates ağ hatası fırlatmaz, onError'a gider; offset ilerlemez, sonraki turda güncelleme işlenir", async () => {
    const fetchFn = vi
      .fn()
      .mockRejectedValueOnce(new Error("fetch failed"))
      .mockResolvedValueOnce({
        json: async () => ({
          ok: true,
          result: [{ update_id: 5, message: { message_id: 1, chat: { id: 7 }, text: "/status" } }],
        }),
      });
    const errors: unknown[] = [];
    const poller = new TelegramPoller(new TelegramClient("TOKEN", fetchFn as unknown as typeof fetch), 7, (e) =>
      errors.push(e),
    );
    const commands: string[] = [];
    poller.onCommandMessage((_c, command) => commands.push(command));

    await expect(poller.pollOnce(0)).resolves.toBeUndefined();
    expect(errors).toHaveLength(1);
    await poller.pollOnce(0);
    expect(commands).toEqual(["/status"]);
    expect(JSON.parse(fetchFn.mock.calls[1][1].body).offset).toBe(0);
  });
});

describe("TelegramPoller — answerCallbackQuery hatası", () => {
  it("'query is too old' süreci düşürmez: karar yine iletilir, hata onError'a gider", async () => {
    const fetchFn = vi.fn().mockImplementation(async (url: string) => {
      if (url.endsWith("/answerCallbackQuery")) {
        return {
          json: async () => ({
            ok: false,
            error_code: 400,
            description: "Bad Request: query is too old and response timeout expired or query ID is invalid",
          }),
        };
      }
      return {
        json: async () => ({
          ok: true,
          result: [{ update_id: 1, callback_query: { id: "cb-1", data: "approve", message: { message_id: 42, chat: { id: 7 } } } }],
        }),
      };
    });
    const errors: unknown[] = [];
    const poller = new TelegramPoller(new TelegramClient("TOKEN", fetchFn as unknown as typeof fetch), 7, (e) => errors.push(e));
    const unhandled: unknown[] = [];
    const onUnhandled = (e: unknown) => unhandled.push(e);
    process.on("unhandledRejection", onUnhandled);
    try {
      const answer = poller.registerAsk(42);
      await poller.pollOnce();
      expect(await answer).toBe("approve");
      await new Promise((r) => setTimeout(r, 10));
      expect(unhandled).toEqual([]);
      expect(String(errors[0])).toContain("query is too old");
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });
});

describe("TelegramPoller — registerAsk'tan önce gelen cevap", () => {
  it("cevap kayıttan önce gelirse saklanır, registerAsk onu hemen döner (eskiden düşürülüyordu)", async () => {
    const client = clientReturning([
      { update_id: 1, callback_query: { id: "cb-1", data: "opt:1", from: { id: 1 }, message: { message_id: 42, chat: { id: 7 } } } },
    ]);
    const poller = new TelegramPoller(client, 7);
    await poller.pollOnce();
    expect(await poller.registerAsk(42)).toBe("opt:1");
  });
});
