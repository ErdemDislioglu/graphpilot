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
export class MockNotifier implements Notifier {
  readonly sent: string[] = [];
  readonly asked: { question: string; options: NotifierOption[] }[] = [];
  readonly edited: { messageId: string; text: string }[] = [];
  private answerQueue: string[];
  private onAsk?: (question: string, options: NotifierOption[]) => string;

  constructor(opts: { answers?: string[]; onAsk?: (q: string, o: NotifierOption[]) => string } = {}) {
    this.answerQueue = [...(opts.answers ?? [])];
    this.onAsk = opts.onAsk;
  }

  async send(message: string): Promise<void> {
    this.sent.push(message);
  }

  async ask(question: string, options: NotifierOption[]): Promise<string> {
    this.asked.push({ question, options });
    if (this.onAsk) return this.onAsk(question, options);
    const next = this.answerQueue.shift();
    if (next === undefined) {
      throw new Error("MockNotifier: ask() çağrıldı ama cevap kuyruğu boş (testte önceden kuyruklanmalı)");
    }
    return next;
  }

  async edit(messageId: string, text: string): Promise<void> {
    this.edited.push({ messageId, text });
  }
}

/**
 * Roadmap 12.4 — "Ağ hatasında mesajlar kuyruğa alınır ve yeniden denenir; bildirim
 * hatası yürütmeyi asla durdurmaz." Herhangi bir `Notifier`'ı sarar; `send`/`edit`
 * başarısız olursa hatayı YUTAR (loglar, fırlatmaz) ve kalıcı bir kuyruğa ekler —
 * `ask()` SARILMAZ (kullanıcı cevabı beklemek yürütmeyi zaten durdurur, bu kasıtlı).
 */
export class RetryingNotifier implements Notifier {
  readonly failedQueue: { kind: "send" | "edit"; payload: unknown }[] = [];

  constructor(
    private readonly inner: Notifier,
    private readonly onError: (err: unknown) => void = () => {},
  ) {}

  async send(message: string): Promise<void> {
    try {
      await this.inner.send(message);
    } catch (err) {
      this.onError(err);
      this.failedQueue.push({ kind: "send", payload: message });
    }
  }

  async ask(question: string, options: NotifierOption[]): Promise<string> {
    return this.inner.ask(question, options);
  }

  async edit(messageId: string, text: string): Promise<void> {
    try {
      await this.inner.edit(messageId, text);
    } catch (err) {
      this.onError(err);
      this.failedQueue.push({ kind: "edit", payload: { messageId, text } });
    }
  }

  /** Kuyruktaki başarısız mesajları tekrar dener (ör. autopilot loop'un her turunda). */
  async flush(): Promise<void> {
    const pending = this.failedQueue.splice(0, this.failedQueue.length);
    for (const item of pending) {
      if (item.kind === "send") await this.send(item.payload as string);
      else {
        const { messageId, text } = item.payload as { messageId: string; text: string };
        await this.edit(messageId, text);
      }
    }
  }
}
