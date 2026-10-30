/**
 * Roadmap 12.4/12.8/12.9 — paylaşımlı güncelleme döngüsü. Telegram'ın `getUpdates` offset'i
 * BOT TOKEN başına küreseldir (belirli bir offset'le çağırmak önceki tüm güncellemeleri
 * ONAYLAR) — bu yüzden bir bot için TEK bir sürekli `getUpdates` döngüsü olmalı. `ask()`'ın
 * cevap beklemesi (buton) ve `/status` gibi komutların dinlenmesi (12.8) bu yüzden AYRI
 * `getUpdates` çağrıları yapamaz; ikisi de bu paylaşımlı poller'a kayıt olur, ana otopilot
 * döngüsü (12.7) `pollOnce()`'u periyodik çağırır.
 */
export class TelegramPoller {
    client;
    allowedChatId;
    onError;
    offset = 0;
    pending = new Map();
    answeredCallbackIds = new Set();
    /** `registerAsk`'tan ÖNCE gelen buton cevapları (soru arka planda gönderilirken poll
     * araya girebilir) — eskiden düşürülüyordu, soru bir daha cevaplanamıyordu. */
    earlyAnswers = new Map();
    onCommand;
    constructor(client, allowedChatId, 
    /** Faz 12.13 — `getUpdates` ağ hatası (ör. "fetch failed") buraya gider, döngüyü düşürmez. */
    onError = () => { }) {
        this.client = client;
        this.allowedChatId = allowedChatId;
        this.onError = onError;
    }
    /** `TelegramNotifier.ask()` tarafından çağrılır — ilgili mesajın buton cevabını bekleyen bir Promise döner. */
    registerAsk(messageId) {
        const early = this.earlyAnswers.get(messageId);
        if (early !== undefined) {
            this.earlyAnswers.delete(messageId);
            return Promise.resolve(early);
        }
        return new Promise((resolve) => {
            this.pending.set(messageId, resolve);
        });
    }
    /** Roadmap 12.8 — `/status`, `/pause`, `/resume`, `/stop`, `/report` sabit komutları için. */
    onCommandMessage(handler) {
        this.onCommand = handler;
    }
    /** Tek bir `getUpdates` turu. `timeoutSeconds: 0` → anında döner (test ve kısa-aralıklı tur için). */
    async pollOnce(timeoutSeconds = 0) {
        let updates;
        try {
            updates = await this.client.getUpdates(this.offset, timeoutSeconds);
        }
        catch (err) {
            // Pilotta geçici bir ağ kesintisi otopilot sürecini öldürdü; offset ilerlemediği
            // için kaçan güncellemeler bir sonraki turda yine gelir.
            this.onError(err);
            return;
        }
        for (const update of updates) {
            this.offset = Math.max(this.offset, update.update_id + 1);
            this.handleUpdate(update);
        }
    }
    handleUpdate(update) {
        if (update.callback_query)
            this.handleCallbackQuery(update.callback_query);
        else if (update.message)
            this.handleMessage(update.message);
    }
    /** Roadmap 12.9 — "Bot sadece kayıtlı chat ID'den gelen mesajlara cevap verir; diğerlerini sessizce yok sayar." */
    isAllowed(chatId) {
        return String(chatId) === String(this.allowedChatId);
    }
    handleCallbackQuery(cb) {
        if (!cb.message || !this.isAllowed(cb.message.chat.id))
            return;
        // Roadmap 12.9 — "aynı butona iki kez basmak iki eylem üretmez": bu callback_query.id
        // daha önce işlendiyse (hızlı art arda tıklama, Telegram'ın kendi tekrar denemesi vb.)
        // tamamen yok say.
        if (this.answeredCallbackIds.has(cb.id))
            return;
        if (cb.data === undefined)
            return;
        const waiter = this.pending.get(cb.message.message_id);
        if (!waiter) {
            // Bekleyen yok: ya soru henüz kaydolmadı (yarış) ya da eski bir mesaj (ör. süreç
            // yeniden başladı). İlki için sakla; tampon sınırlı — eski mesajlar birikip şişirmesin.
            if (this.earlyAnswers.size >= 50)
                this.earlyAnswers.delete(this.earlyAnswers.keys().next().value);
            this.earlyAnswers.set(cb.message.message_id, cb.data);
            return;
        }
        this.answeredCallbackIds.add(cb.id);
        this.pending.delete(cb.message.message_id);
        // Yalnız butonun "yükleniyor" göstergesini kapatır — karar zaten alındı. Hata (ör. geç
        // poll'da "query is too old") yakalanmazsa unhandled rejection süreci öldürüyordu (pilot:
        // "Onayla"dan sonra otopilot kapandı, görev hiç başlamadı).
        this.client.answerCallbackQuery(cb.id).catch((err) => this.onError(err));
        waiter(cb.data);
    }
    handleMessage(msg) {
        if (!this.isAllowed(msg.chat.id))
            return;
        // Roadmap 12.8 — "Serbest metin komut olarak asla çalıştırılmaz; sadece bu sabit
        // komutlar ve buton cevapları kabul edilir."
        if (!msg.text || !msg.text.startsWith("/"))
            return;
        const [command, ...rest] = msg.text.trim().split(/\s+/);
        this.onCommand?.(msg.chat.id, command, rest.join(" "));
    }
}
