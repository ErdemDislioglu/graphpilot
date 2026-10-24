import { describe, expect, it, vi } from "vitest";
import { TelegramApiError, TelegramClient, type TelegramFetch } from "../autopilot/telegramClient.js";

function fakeFetch(response: unknown): TelegramFetch {
  return vi.fn().mockResolvedValue({
    json: async () => response,
  }) as unknown as TelegramFetch;
}

describe("TelegramClient", () => {
  it("getMe — başarılı yanıtı result alanından döner", async () => {
    const fetchFn = fakeFetch({ ok: true, result: { id: 1, is_bot: true, first_name: "Bot" } });
    const client = new TelegramClient("TOKEN", fetchFn);
    const me = await client.getMe();
    expect(me.id).toBe(1);
  });

  it("token hiçbir zaman call sonucuna/throw edilen hataya sızmaz", async () => {
    const fetchFn = fakeFetch({ ok: false, description: "Unauthorized", error_code: 401 });
    const client = new TelegramClient("GİZLİ-TOKEN-123", fetchFn);
    await expect(client.getMe()).rejects.toThrow(/Unauthorized/);
    try {
      await client.getMe();
    } catch (err) {
      expect(String(err)).not.toContain("GİZLİ-TOKEN-123");
    }
  });

  it("ok:false olduğunda TelegramApiError fırlatır, description'ı taşır", async () => {
    const fetchFn = fakeFetch({ ok: false, description: "chat not found", error_code: 400 });
    const client = new TelegramClient("TOKEN", fetchFn);
    await expect(client.getMe()).rejects.toThrow(TelegramApiError);
    await expect(client.getMe()).rejects.toThrow(/chat not found/);
  });

  it("sendMessage — reply_markup verilmezse body'de gönderilmez", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      json: async () => ({ ok: true, result: { message_id: 42, chat: { id: 7 } } }),
    }) as unknown as TelegramFetch;
    const client = new TelegramClient("TOKEN", fetchFn);
    const msg = await client.sendMessage(7, "merhaba");
    expect(msg.message_id).toBe(42);
    const call = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(call[1].body);
    expect(body).toEqual({ chat_id: 7, text: "merhaba" });
  });

  it("sendMessage — reply_markup (inline keyboard) body'ye eklenir", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      json: async () => ({ ok: true, result: { message_id: 1, chat: { id: 7 } } }),
    }) as unknown as TelegramFetch;
    const client = new TelegramClient("TOKEN", fetchFn);
    await client.sendMessage(7, "soru", {
      inline_keyboard: [[{ text: "Evet", callback_data: "yes" }]],
    });
    const call = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(call[1].body);
    expect(body.reply_markup.inline_keyboard[0][0].callback_data).toBe("yes");
  });

  it("editMessageText — reply_markup verilmezse klavyeyi boşaltır (butonlar kaldırılır)", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      json: async () => ({ ok: true, result: true }),
    }) as unknown as TelegramFetch;
    const client = new TelegramClient("TOKEN", fetchFn);
    await client.editMessageText(7, 42, "✓ Karar verildi: Tekrar dene");
    const call = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(call[1].body);
    expect(body.reply_markup).toEqual({ inline_keyboard: [] });
  });

  it("answerCallbackQuery — callback_query_id'yi body'de gönderir", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      json: async () => ({ ok: true, result: true }),
    }) as unknown as TelegramFetch;
    const client = new TelegramClient("TOKEN", fetchFn);
    await client.answerCallbackQuery("cb-1");
    const call = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(call[1].body);
    expect(body.callback_query_id).toBe("cb-1");
  });

  it("getUpdates — offset ve timeout'u body'de gönderir, sonucu dizi olarak döner", async () => {
    const updates = [{ update_id: 1, message: { message_id: 1, chat: { id: 7 }, text: "/status" } }];
    const fetchFn = vi.fn().mockResolvedValue({
      json: async () => ({ ok: true, result: updates }),
    }) as unknown as TelegramFetch;
    const client = new TelegramClient("TOKEN", fetchFn);
    const result = await client.getUpdates(5, 30);
    expect(result).toEqual(updates);
    const call = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(call[1].body);
    expect(body).toMatchObject({ offset: 5, timeout: 30 });
  });

  it("isteğin URL'inde token path parametresi olarak yer alır", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      json: async () => ({ ok: true, result: { id: 1, is_bot: true, first_name: "Bot" } }),
    }) as unknown as TelegramFetch;
    const client = new TelegramClient("ABC123", fetchFn);
    await client.getMe();
    const call = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe("https://api.telegram.org/botABC123/getMe");
  });
});
