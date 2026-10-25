import { describe, expect, it, vi } from "vitest";
import { TelegramClient } from "../autopilot/telegramClient.js";
import { TelegramNotifier } from "../autopilot/telegramNotifier.js";
import { TelegramPoller } from "../autopilot/telegramPoller.js";

function setup(): { client: TelegramClient; poller: TelegramPoller; notifier: TelegramNotifier; fetchFn: ReturnType<typeof vi.fn> } {
  const fetchFn = vi.fn();
  const client = new TelegramClient("TOKEN", fetchFn as unknown as typeof fetch);
  const poller = new TelegramPoller(client, 7);
  const notifier = new TelegramNotifier(client, 7, poller);
  return { client, poller, notifier, fetchFn };
}

describe("TelegramNotifier", () => {
  it("send — sendMessage'i doğru chat_id ve metinle çağırır", async () => {
    const { notifier, fetchFn } = setup();
    fetchFn.mockResolvedValue({ json: async () => ({ ok: true, result: { message_id: 1, chat: { id: 7 } } }) });
    await notifier.send("merhaba");
    const body = JSON.parse(fetchFn.mock.calls[0][1].body);
    expect(body).toEqual({ chat_id: 7, text: "merhaba" });
  });

  it("edit — editMessageText'i messageId'yi sayıya çevirerek çağırır", async () => {
    const { notifier, fetchFn } = setup();
    fetchFn.mockResolvedValue({ json: async () => ({ ok: true, result: true }) });
    await notifier.edit("42", "güncellendi");
    const body = JSON.parse(fetchFn.mock.calls[0][1].body);
    expect(body.message_id).toBe(42);
    expect(body.text).toBe("güncellendi");
  });

  it("ask — soruyu butonlarla gönderir, poller cevap verince değeri döner ve mesajı düzenler", async () => {
    const { notifier, poller, fetchFn } = setup();
    fetchFn.mockResolvedValueOnce({
      json: async () => ({ ok: true, result: { message_id: 42, chat: { id: 7 } } }),
    }); // sendMessage

    const askPromise = notifier.ask("Ne yapalım?", [
      { label: "Tekrar dene", value: "retry" },
      { label: "Atla", value: "skip" },
    ]);

    // sendMessage'in gerçekten gönderildiğini ve butonların doğru şekillendiğini doğrula.
    await Promise.resolve();
    const sendBody = JSON.parse(fetchFn.mock.calls[0][1].body);
    expect(sendBody.reply_markup.inline_keyboard).toEqual([
      [{ text: "Tekrar dene", callback_data: "retry" }],
      [{ text: "Atla", callback_data: "skip" }],
    ]);

    // Ana otopilot döngüsünün periyodik pollOnce() çağrısını simüle et — Telegram'dan
    // bu butona basıldığına dair callback_query geldiğini varsayıyoruz.
    fetchFn.mockResolvedValueOnce({
      json: async () => ({
        ok: true,
        result: [
          {
            update_id: 1,
            callback_query: { id: "cb-1", data: "retry", from: { id: 999 }, message: { message_id: 42, chat: { id: 7 } } },
          },
        ],
      }),
    }); // getUpdates
    fetchFn.mockResolvedValueOnce({ json: async () => ({ ok: true, result: true }) }); // answerCallbackQuery
    fetchFn.mockResolvedValueOnce({ json: async () => ({ ok: true, result: true }) }); // editMessageText (ask'in kendi düzenlemesi)
    await poller.pollOnce();

    const answer = await askPromise;
    expect(answer).toBe("retry");
    // Çağrı sırası: 0=sendMessage(soru) 1=getUpdates 2=answerCallbackQuery 3=editMessageText
    const editBody = JSON.parse(fetchFn.mock.calls[3][1].body);
    expect(editBody.text).toBe("Ne yapalım?\n\n✓ Karar verildi: Tekrar dene");
  });
});

describe("TelegramNotifier.ask — ağ hatası (Faz 12.13)", () => {
  it("soru mesajı ağ hatasında yeniden denenir; son düzenleme hatası kararı düşürmez", async () => {
    const fetchFn = vi.fn();
    const client = new TelegramClient("TOKEN", fetchFn as unknown as typeof fetch);
    const poller = new TelegramPoller(client, 7);
    const sleeps: number[] = [];
    const notifier = new TelegramNotifier(client, 7, poller, {
      attempts: 3,
      waitMs: 10,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });
    fetchFn
      .mockRejectedValueOnce(new Error("fetch failed"))
      .mockResolvedValueOnce({ json: async () => ({ ok: true, result: { message_id: 9, chat: { id: 7 } } }) })
      .mockResolvedValueOnce({
        json: async () => ({
          ok: true,
          result: [{ update_id: 1, callback_query: { id: "c1", data: "retry", message: { message_id: 9, chat: { id: 7 } } } }],
        }),
      })
      .mockResolvedValueOnce({ json: async () => ({ ok: true, result: true }) }) // answerCallbackQuery
      .mockRejectedValueOnce(new Error("fetch failed")); // editMessageText

    const answer = notifier.ask("Ne yapalım?", [{ label: "Tekrar dene", value: "retry" }]);
    await vi.waitFor(() => expect(fetchFn).toHaveBeenCalledTimes(2));
    await poller.pollOnce(0);
    await expect(answer).resolves.toBe("retry");
    expect(sleeps).toEqual([10]);
  });

  it("tüm denemeler tükenirse hatayı fırlatır", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error("fetch failed"));
    const client = new TelegramClient("TOKEN", fetchFn as unknown as typeof fetch);
    const notifier = new TelegramNotifier(client, 7, new TelegramPoller(client, 7), {
      attempts: 2,
      waitMs: 1,
      sleep: async () => {},
    });
    await expect(notifier.ask("?", [])).rejects.toThrow();
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });
});
