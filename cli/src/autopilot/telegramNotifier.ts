import type { InlineKeyboardMarkup, TelegramClient } from "./telegramClient.js";
import type { TelegramPoller } from "./telegramPoller.js";
import type { Notifier, NotifierOption } from "./notifier.js";

function buildInlineKeyboard(options: NotifierOption[]): InlineKeyboardMarkup {
  // Roadmap 12.5 örneği (4 buton) tek satırda okunaklı değil — her buton kendi satırında.
  return { inline_keyboard: options.map((o) => [{ text: o.label, callback_data: o.value }]) };
}

/**
 * Roadmap 12.4 — `Notifier`'ın MVP (ve şimdilik tek) gerçek uygulaması. `getUpdates`
 * çağrısını KENDİSİ yapmaz — `TelegramPoller` ile paylaşır (bkz. telegramPoller.ts'in
 * başındaki not: tek bot için tek sürekli `getUpdates` döngüsü olmalı, offset küreseldir).
 */
export class TelegramNotifier implements Notifier {
  constructor(
    private readonly client: TelegramClient,
    private readonly chatId: number | string,
    private readonly poller: TelegramPoller,
  ) {}

  async send(message: string): Promise<void> {
    await this.client.sendMessage(this.chatId, message);
  }

  async edit(messageId: string, text: string): Promise<void> {
    await this.client.editMessageText(this.chatId, Number(messageId), text);
  }

  /**
   * Butonlu soru sorar, `TelegramPoller`'a kayıt olup cevabı bekler (ana otopilot
   * döngüsünün `poller.pollOnce()`'u periyodik çağırmasıyla ilerler), cevap gelince
   * soru mesajını "✓ Karar verildi: ..." ile günceller (butonlar kalkar — roadmap 12.9'un
   * tek-kullanımlık gereksinimi bu şekilde de UI'da yansır).
   */
  async ask(question: string, options: NotifierOption[]): Promise<string> {
    const sent = await this.client.sendMessage(this.chatId, question, buildInlineKeyboard(options));
    const value = await this.poller.registerAsk(sent.message_id);
    const chosen = options.find((o) => o.value === value);
    await this.client.editMessageText(
      this.chatId,
      sent.message_id,
      `${question}\n\n✓ Karar verildi: ${chosen?.label ?? value}`,
    );
    return value;
  }
}
