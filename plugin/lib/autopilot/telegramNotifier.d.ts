import type { TelegramClient } from "./telegramClient.js";
import type { TelegramPoller } from "./telegramPoller.js";
import type { Notifier, NotifierOption } from "./notifier.js";
/**
 * Roadmap 12.4 — `Notifier`'ın MVP (ve şimdilik tek) gerçek uygulaması. `getUpdates`
 * çağrısını KENDİSİ yapmaz — `TelegramPoller` ile paylaşır (bkz. telegramPoller.ts'in
 * başındaki not: tek bot için tek sürekli `getUpdates` döngüsü olmalı, offset küreseldir).
 */
export declare class TelegramNotifier implements Notifier {
    private readonly client;
    private readonly chatId;
    private readonly poller;
    /** Faz 12.13 — `ask()`'ın soru mesajı ağ hatasında bu aralıkla yeniden denenir. */
    private readonly retry;
    constructor(client: TelegramClient, chatId: number | string, poller: TelegramPoller, 
    /** Faz 12.13 — `ask()`'ın soru mesajı ağ hatasında bu aralıkla yeniden denenir. */
    retry?: {
        attempts: number;
        waitMs: number;
        sleep: (ms: number) => Promise<void>;
    });
    send(message: string): Promise<void>;
    edit(messageId: string, text: string): Promise<void>;
    /**
     * Butonlu soru sorar, `TelegramPoller`'a kayıt olup cevabı bekler (ana otopilot
     * döngüsünün `poller.pollOnce()`'u periyodik çağırmasıyla ilerler), cevap gelince
     * soru mesajını "✓ Karar verildi: ..." ile günceller (butonlar kalkar — roadmap 12.9'un
     * tek-kullanımlık gereksinimi bu şekilde de UI'da yansır).
     */
    ask(question: string, options: NotifierOption[]): Promise<string>;
    private sendWithRetry;
}
