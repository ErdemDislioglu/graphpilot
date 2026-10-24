import type { TelegramClient } from "./telegramClient.js";
/**
 * Roadmap 12.4/12.8/12.9 — paylaşımlı güncelleme döngüsü. Telegram'ın `getUpdates` offset'i
 * BOT TOKEN başına küreseldir (belirli bir offset'le çağırmak önceki tüm güncellemeleri
 * ONAYLAR) — bu yüzden bir bot için TEK bir sürekli `getUpdates` döngüsü olmalı. `ask()`'ın
 * cevap beklemesi (buton) ve `/status` gibi komutların dinlenmesi (12.8) bu yüzden AYRI
 * `getUpdates` çağrıları yapamaz; ikisi de bu paylaşımlı poller'a kayıt olur, ana otopilot
 * döngüsü (12.7) `pollOnce()`'u periyodik çağırır.
 */
export declare class TelegramPoller {
    private readonly client;
    private readonly allowedChatId;
    private offset;
    private readonly pending;
    private readonly answeredCallbackIds;
    private onCommand?;
    constructor(client: TelegramClient, allowedChatId: number | string);
    /** `TelegramNotifier.ask()` tarafından çağrılır — ilgili mesajın buton cevabını bekleyen bir Promise döner. */
    registerAsk(messageId: number): Promise<string>;
    /** Roadmap 12.8 — `/status`, `/pause`, `/resume`, `/stop`, `/report` sabit komutları için. */
    onCommandMessage(handler: (chatId: number, command: string, args: string) => void): void;
    /** Tek bir `getUpdates` turu. `timeoutSeconds: 0` → anında döner (test ve kısa-aralıklı tur için). */
    pollOnce(timeoutSeconds?: number): Promise<void>;
    private handleUpdate;
    /** Roadmap 12.9 — "Bot sadece kayıtlı chat ID'den gelen mesajlara cevap verir; diğerlerini sessizce yok sayar." */
    private isAllowed;
    private handleCallbackQuery;
    private handleMessage;
}
