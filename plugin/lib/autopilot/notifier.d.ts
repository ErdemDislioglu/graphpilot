/** Roadmap 12.4 — bildirim adaptörü arayüzü. Bir seçeneğin `value`'su buton basıldığında
 * dönen (tek kullanımlık, idempotent) kimlik — 12.9'un "aynı butona iki kez basmak iki
 * eylem üretmez" kuralı implementasyon tarafında (`TelegramNotifier`) uygulanır. */
export interface NotifierOption {
    label: string;
    value: string;
}
/**
 * Roadmap 12.4 — `Notifier` arayüzü. İleride Slack/Discord/WhatsApp eklenecek şekilde
 * soyut: yürütücü (autopilot loop) SADECE bu arayüzü bilir, hangi kanalın arkada
 * olduğunu bilmez. Gerçek ağ I/O olduğu için async — bu projenin geri kalanı (CLI)
 * senkron ama bildirim katmanı doğası gereği öyle değil.
 */
export interface Notifier {
    send(message: string): Promise<void>;
    /** Kullanıcıya butonlu bir soru sorar, seçilen `value`'yu döner. */
    ask(question: string, options: NotifierOption[]): Promise<string>;
    /** Var olan bir mesajı günceller (ör. "Karar gerekiyor" → "✓ Karar verildi: ..."). */
    edit(messageId: string, text: string): Promise<void>;
}
/**
 * Roadmap 12.11 — "MockNotifier ile tam otopilot akışı" testleri için. Gerçek ağ YOK;
 * `ask`'a verilecek cevaplar önceden kuyruğa kuyruk olarak ya da bir `onAsk` callback'iyle
 * dinamik olarak sağlanır.
 */
export declare class MockNotifier implements Notifier {
    readonly sent: string[];
    readonly asked: {
        question: string;
        options: NotifierOption[];
    }[];
    readonly edited: {
        messageId: string;
        text: string;
    }[];
    private answerQueue;
    private onAsk?;
    constructor(opts?: {
        answers?: string[];
        onAsk?: (q: string, o: NotifierOption[]) => string;
    });
    send(message: string): Promise<void>;
    ask(question: string, options: NotifierOption[]): Promise<string>;
    edit(messageId: string, text: string): Promise<void>;
}
/**
 * Roadmap 12.4 — "Ağ hatasında mesajlar kuyruğa alınır ve yeniden denenir; bildirim
 * hatası yürütmeyi asla durdurmaz." Herhangi bir `Notifier`'ı sarar; `send`/`edit`
 * başarısız olursa hatayı YUTAR (loglar, fırlatmaz) ve kalıcı bir kuyruğa ekler —
 * `ask()` SARILMAZ (kullanıcı cevabı beklemek yürütmeyi zaten durdurur, bu kasıtlı).
 */
export declare class RetryingNotifier implements Notifier {
    private readonly inner;
    private readonly onError;
    readonly failedQueue: {
        kind: "send" | "edit";
        payload: unknown;
    }[];
    constructor(inner: Notifier, onError?: (err: unknown) => void);
    send(message: string): Promise<void>;
    ask(question: string, options: NotifierOption[]): Promise<string>;
    edit(messageId: string, text: string): Promise<void>;
    /** Kuyruktaki başarısız mesajları tekrar dener (ör. autopilot loop'un her turunda). */
    flush(): Promise<void>;
}
