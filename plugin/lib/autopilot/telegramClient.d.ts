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
    chat: {
        id: number;
    };
    text?: string;
}
export interface TelegramCallbackQuery {
    id: string;
    data?: string;
    message?: TelegramMessage;
    from: {
        id: number;
    };
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
export declare class TelegramApiError extends Error {
    readonly method: string;
    readonly description: string;
    readonly errorCode?: number | undefined;
    constructor(method: string, description: string, errorCode?: number | undefined);
}
export declare class TelegramClient {
    private readonly token;
    private readonly fetchFn;
    constructor(token: string, fetchFn?: TelegramFetch);
    private call;
    /** Token'ın geçerli olduğunu doğrular (`gp autopilot setup`, roadmap 12.2). */
    getMe(): Promise<TelegramUser>;
    sendMessage(chatId: number | string, text: string, replyMarkup?: InlineKeyboardMarkup): Promise<TelegramMessage>;
    editMessageText(chatId: number | string, messageId: number, text: string, replyMarkup?: InlineKeyboardMarkup): Promise<void>;
    answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void>;
    /**
     * Long polling (roadmap 12.1: doğrulandı — `timeout` saniye cinsinde, Telegram o süre
     * içinde güncelleme gelirse hemen, gelmezse süre dolunca boş dizi döner). Sunucu
     * gerektirmez (12 mimari notu).
     */
    getUpdates(offset: number, timeoutSeconds: number): Promise<TelegramUpdate[]>;
}
