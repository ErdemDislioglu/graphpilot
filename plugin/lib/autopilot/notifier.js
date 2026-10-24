/**
 * Roadmap 12.11 — "MockNotifier ile tam otopilot akışı" testleri için. Gerçek ağ YOK;
 * `ask`'a verilecek cevaplar önceden kuyruğa kuyruk olarak ya da bir `onAsk` callback'iyle
 * dinamik olarak sağlanır.
 */
export class MockNotifier {
    sent = [];
    asked = [];
    edited = [];
    answerQueue;
    onAsk;
    constructor(opts = {}) {
        this.answerQueue = [...(opts.answers ?? [])];
        this.onAsk = opts.onAsk;
    }
    async send(message) {
        this.sent.push(message);
    }
    async ask(question, options) {
        this.asked.push({ question, options });
        if (this.onAsk)
            return this.onAsk(question, options);
        const next = this.answerQueue.shift();
        if (next === undefined) {
            throw new Error("MockNotifier: ask() çağrıldı ama cevap kuyruğu boş (testte önceden kuyruklanmalı)");
        }
        return next;
    }
    async edit(messageId, text) {
        this.edited.push({ messageId, text });
    }
}
/**
 * Roadmap 12.4 — "Ağ hatasında mesajlar kuyruğa alınır ve yeniden denenir; bildirim
 * hatası yürütmeyi asla durdurmaz." Herhangi bir `Notifier`'ı sarar; `send`/`edit`
 * başarısız olursa hatayı YUTAR (loglar, fırlatmaz) ve kalıcı bir kuyruğa ekler —
 * `ask()` SARILMAZ (kullanıcı cevabı beklemek yürütmeyi zaten durdurur, bu kasıtlı).
 */
export class RetryingNotifier {
    inner;
    onError;
    failedQueue = [];
    constructor(inner, onError = () => { }) {
        this.inner = inner;
        this.onError = onError;
    }
    async send(message) {
        try {
            await this.inner.send(message);
        }
        catch (err) {
            this.onError(err);
            this.failedQueue.push({ kind: "send", payload: message });
        }
    }
    async ask(question, options) {
        return this.inner.ask(question, options);
    }
    async edit(messageId, text) {
        try {
            await this.inner.edit(messageId, text);
        }
        catch (err) {
            this.onError(err);
            this.failedQueue.push({ kind: "edit", payload: { messageId, text } });
        }
    }
    /** Kuyruktaki başarısız mesajları tekrar dener (ör. autopilot loop'un her turunda). */
    async flush() {
        const pending = this.failedQueue.splice(0, this.failedQueue.length);
        for (const item of pending) {
            if (item.kind === "send")
                await this.send(item.payload);
            else {
                const { messageId, text } = item.payload;
                await this.edit(messageId, text);
            }
        }
    }
}
