/**
 * Roadmap 12.1/12.4 — Telegram Bot API'nin ham HTTP sarmalayıcısı (core.claude.com DEĞİL,
 * core.telegram.org/bots/api — 2026-10-24'te WebFetch ile doğrulandı). Node 22'nin yerleşik
 * `fetch`'i kullanılır, yeni bağımlılık YOK (CLAUDE.md: "bağımlılık eklemeden önce sor").
 *
 * GÜVENLİK (12.9): bot token'ı İSTEK URL'İNİN parçası — hiçbir hata mesajına, loga ya da
 * fırlatılan Error'a URL'in kendisi YAZILMAZ; sadece metod adı ve Telegram'ın döndürdüğü
 * `description` kullanılır.
 */
export class TelegramApiError extends Error {
    method;
    description;
    errorCode;
    constructor(method, description, errorCode) {
        super(`Telegram API hatası (${method}): ${description}`);
        this.method = method;
        this.description = description;
        this.errorCode = errorCode;
    }
}
export class TelegramClient {
    token;
    fetchFn;
    constructor(token, fetchFn = fetch) {
        this.token = token;
        this.fetchFn = fetchFn;
    }
    async call(method, body) {
        const res = await this.fetchFn(`https://api.telegram.org/bot${this.token}/${method}`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
        });
        const envelope = (await res.json());
        if (!envelope.ok || envelope.result === undefined) {
            throw new TelegramApiError(method, envelope.description ?? "bilinmeyen hata", envelope.error_code);
        }
        return envelope.result;
    }
    /** Token'ın geçerli olduğunu doğrular (`gp autopilot setup`, roadmap 12.2). */
    async getMe() {
        return this.call("getMe", {});
    }
    async sendMessage(chatId, text, replyMarkup) {
        return this.call("sendMessage", {
            chat_id: chatId,
            text,
            ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
        });
    }
    async editMessageText(chatId, messageId, text, replyMarkup) {
        await this.call("editMessageText", {
            chat_id: chatId,
            message_id: messageId,
            text,
            ...(replyMarkup ? { reply_markup: replyMarkup } : { reply_markup: { inline_keyboard: [] } }),
        });
    }
    async answerCallbackQuery(callbackQueryId, text) {
        await this.call("answerCallbackQuery", {
            callback_query_id: callbackQueryId,
            ...(text ? { text } : {}),
        });
    }
    /**
     * Long polling (roadmap 12.1: doğrulandı — `timeout` saniye cinsinde, Telegram o süre
     * içinde güncelleme gelirse hemen, gelmezse süre dolunca boş dizi döner). Sunucu
     * gerektirmez (12 mimari notu).
     */
    async getUpdates(offset, timeoutSeconds) {
        return this.call("getUpdates", {
            offset,
            timeout: timeoutSeconds,
            allowed_updates: ["message", "callback_query"],
        });
    }
}
