import type { TelegramCallbackQuery, TelegramClient, TelegramMessage, TelegramUpdate } from "./telegramClient.js";

/**
 * Roadmap 12.4/12.8/12.9 — paylaşımlı güncelleme döngüsü. Telegram'ın `getUpdates` offset'i
 * BOT TOKEN başına küreseldir (belirli bir offset'le çağırmak önceki tüm güncellemeleri
 * ONAYLAR) — bu yüzden bir bot için TEK bir sürekli `getUpdates` döngüsü olmalı. `ask()`'ın
 * cevap beklemesi (buton) ve `/status` gibi komutların dinlenmesi (12.8) bu yüzden AYRI
 * `getUpdates` çağrıları yapamaz; ikisi de bu paylaşımlı poller'a kayıt olur, ana otopilot
 * döngüsü (12.7) `pollOnce()`'u periyodik çağırır.
 */
export class TelegramPoller {
  private offset = 0;
  private readonly pending = new Map<number, (value: string) => void>();
  private readonly answeredCallbackIds = new Set<string>();
  private onCommand?: (chatId: number, command: string, args: string) => void;

  constructor(
    private readonly client: TelegramClient,
    private readonly allowedChatId: number | string,
    /** Faz 12.13 — `getUpdates` ağ hatası (ör. "fetch failed") buraya gider, döngüyü düşürmez. */
    private readonly onError: (err: unknown) => void = () => {},
  ) {}

  /** `TelegramNotifier.ask()` tarafından çağrılır — ilgili mesajın buton cevabını bekleyen bir Promise döner. */
  registerAsk(messageId: number): Promise<string> {
    return new Promise((resolve) => {
      this.pending.set(messageId, resolve);
    });
  }

  /** Roadmap 12.8 — `/status`, `/pause`, `/resume`, `/stop`, `/report` sabit komutları için. */
  onCommandMessage(handler: (chatId: number, command: string, args: string) => void): void {
    this.onCommand = handler;
  }

  /** Tek bir `getUpdates` turu. `timeoutSeconds: 0` → anında döner (test ve kısa-aralıklı tur için). */
  async pollOnce(timeoutSeconds = 0): Promise<void> {
    let updates: TelegramUpdate[];
    try {
      updates = await this.client.getUpdates(this.offset, timeoutSeconds);
    } catch (err) {
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

  private handleUpdate(update: TelegramUpdate): void {
    if (update.callback_query) this.handleCallbackQuery(update.callback_query);
    else if (update.message) this.handleMessage(update.message);
  }

  /** Roadmap 12.9 — "Bot sadece kayıtlı chat ID'den gelen mesajlara cevap verir; diğerlerini sessizce yok sayar." */
  private isAllowed(chatId: number): boolean {
    return String(chatId) === String(this.allowedChatId);
  }

  private handleCallbackQuery(cb: TelegramCallbackQuery): void {
    if (!cb.message || !this.isAllowed(cb.message.chat.id)) return;
    // Roadmap 12.9 — "aynı butona iki kez basmak iki eylem üretmez": bu callback_query.id
    // daha önce işlendiyse (hızlı art arda tıklama, Telegram'ın kendi tekrar denemesi vb.)
    // tamamen yok say.
    if (this.answeredCallbackIds.has(cb.id)) return;
    const waiter = this.pending.get(cb.message.message_id);
    if (!waiter || cb.data === undefined) return;
    this.answeredCallbackIds.add(cb.id);
    this.pending.delete(cb.message.message_id);
    void this.client.answerCallbackQuery(cb.id);
    waiter(cb.data);
  }

  private handleMessage(msg: TelegramMessage): void {
    if (!this.isAllowed(msg.chat.id)) return;
    // Roadmap 12.8 — "Serbest metin komut olarak asla çalıştırılmaz; sadece bu sabit
    // komutlar ve buton cevapları kabul edilir."
    if (!msg.text || !msg.text.startsWith("/")) return;
    const [command, ...rest] = msg.text.trim().split(/\s+/);
    this.onCommand?.(msg.chat.id, command, rest.join(" "));
  }
}
