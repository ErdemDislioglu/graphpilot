function buildInlineKeyboard(options) {
    // Roadmap 12.5 örneği (4 buton) tek satırda okunaklı değil — her buton kendi satırında.
    return { inline_keyboard: options.map((o) => [{ text: o.label, callback_data: o.value }]) };
}
/**
 * Roadmap 12.4 — `Notifier`'ın MVP (ve şimdilik tek) gerçek uygulaması. `getUpdates`
 * çağrısını KENDİSİ yapmaz — `TelegramPoller` ile paylaşır (bkz. telegramPoller.ts'in
 * başındaki not: tek bot için tek sürekli `getUpdates` döngüsü olmalı, offset küreseldir).
 */
export class TelegramNotifier {
    client;
    chatId;
    poller;
    retry;
    constructor(client, chatId, poller, 
    /** Faz 12.13 — `ask()`'ın soru mesajı ağ hatasında bu aralıkla yeniden denenir. */
    retry = {
        attempts: 20,
        waitMs: 30_000,
        sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    }) {
        this.client = client;
        this.chatId = chatId;
        this.poller = poller;
        this.retry = retry;
    }
    async send(message) {
        await this.client.sendMessage(this.chatId, message);
    }
    async edit(messageId, text) {
        await this.client.editMessageText(this.chatId, Number(messageId), text);
    }
    /**
     * Butonlu soru sorar, `TelegramPoller`'a kayıt olup cevabı bekler (ana otopilot
     * döngüsünün `poller.pollOnce()`'u periyodik çağırmasıyla ilerler), cevap gelince
     * soru mesajını "✓ Karar verildi: ..." ile günceller (butonlar kalkar — roadmap 12.9'un
     * tek-kullanımlık gereksinimi bu şekilde de UI'da yansır).
     */
    async ask(question, options) {
        const sent = await this.sendWithRetry(question, options);
        const value = await this.poller.registerAsk(sent.message_id);
        const chosen = options.find((o) => o.value === value);
        // Karar zaten alındı: "✓ Karar verildi" düzenlemesi kozmetik, ağ hatası kararı düşürmesin.
        await this.client
            .editMessageText(this.chatId, sent.message_id, `${question}\n\n✓ Karar verildi: ${chosen?.label ?? value}`)
            .catch(() => { });
        return value;
    }
    async sendWithRetry(question, options) {
        for (let attempt = 1;; attempt += 1) {
            try {
                return await this.client.sendMessage(this.chatId, question, buildInlineKeyboard(options));
            }
            catch (err) {
                if (attempt >= this.retry.attempts)
                    throw err;
                await this.retry.sleep(this.retry.waitMs);
            }
        }
    }
}
