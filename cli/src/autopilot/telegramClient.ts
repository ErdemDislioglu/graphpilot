/**
 * Roadmap 12.1/12.4 — Telegram Bot API'nin ham HTTP sarmalayıcısı (core.claude.com DEĞİL,
 * core.telegram.org/bots/api — 2026-10-24'te WebFetch ile doğrulandı). Node 22'nin yerleşik
 * `fetch`'i kullanılır, yeni bağımlılık YOK (CLAUDE.md: "bağımlılık eklemeden önce sor").
 *
 * GÜVENLİK (12.9): bot token'ı İSTEK URL'İNİN parçası — hiçbir hata mesajına, loga ya da
 * fırlatılan Error'a URL'in kendisi YAZILMAZ; sadece metod adı ve Telegram'ın döndürdüğü
 * `description` kullanılır.
 */

export type TelegramFetch = typeof fetch;

export interface InlineKeyboardButton {
  text: string;
  callback_data: string;
}

export type InlineKeyboardMarkup = {
  inline_keyboard: InlineKeyboardButton[][];
};

export interface TelegramMessage {
  message_id: number;
  chat: { id: number };
  text?: string;
}

export interface TelegramCallbackQuery {
  id: string;
  data?: string;
  message?: TelegramMessage;
  from: { id: number };
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  username?: string;
}

interface TelegramEnvelope<T> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
}

export class TelegramApiError extends Error {
  constructor(
    public readonly method: string,
    public readonly description: string,
    public readonly errorCode?: number,
  ) {
    super(`Telegram API hatası (${method}): ${description}`);
  }
}

export class TelegramClient {
  constructor(
    private readonly token: string,
    private readonly fetchFn: TelegramFetch = fetch,
  ) {}

  private async call<T>(method: string, body: Record<string, unknown>): Promise<T> {
    const res = await this.fetchFn(`https://api.telegram.org/bot${this.token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const envelope = (await res.json()) as TelegramEnvelope<T>;
    if (!envelope.ok || envelope.result === undefined) {
      throw new TelegramApiError(method, envelope.description ?? "bilinmeyen hata", envelope.error_code);
    }
    return envelope.result;
  }

  /** Token'ın geçerli olduğunu doğrular (`gp autopilot setup`, roadmap 12.2). */
  async getMe(): Promise<TelegramUser> {
    return this.call<TelegramUser>("getMe", {});
  }

  async sendMessage(
    chatId: number | string,
    text: string,
    replyMarkup?: InlineKeyboardMarkup,
  ): Promise<TelegramMessage> {
    return this.call<TelegramMessage>("sendMessage", {
      chat_id: chatId,
      text,
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    });
  }

  async editMessageText(
    chatId: number | string,
    messageId: number,
    text: string,
    replyMarkup?: InlineKeyboardMarkup,
  ): Promise<void> {
    await this.call<TelegramMessage | true>("editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      text,
      ...(replyMarkup ? { reply_markup: replyMarkup } : { reply_markup: { inline_keyboard: [] } }),
    });
  }

  async answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void> {
    await this.call<true>("answerCallbackQuery", {
      callback_query_id: callbackQueryId,
      ...(text ? { text } : {}),
    });
  }

  /**
   * Long polling (roadmap 12.1: doğrulandı — `timeout` saniye cinsinde, Telegram o süre
   * içinde güncelleme gelirse hemen, gelmezse süre dolunca boş dizi döner). Sunucu
   * gerektirmez (12 mimari notu).
   */
  async getUpdates(offset: number, timeoutSeconds: number): Promise<TelegramUpdate[]> {
    return this.call<TelegramUpdate[]>("getUpdates", {
      offset,
      timeout: timeoutSeconds,
      allowed_updates: ["message", "callback_query"],
    });
  }
}
