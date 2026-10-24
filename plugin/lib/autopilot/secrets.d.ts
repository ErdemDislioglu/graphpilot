/**
 * Roadmap 12.2/12.9 — "Bot token ve chat ID `config.yml`'de DEĞİL, yerel gizli dosyada
 * (`~/.graphpilot/secrets.json`) ya da ortam değişkeninde." Bu dosya PROJE DİZİNİNİN
 * (`.graph/`, repo) DIŞINDA tutulur — `gp context` hiçbir zaman ev dizinini okumadığı için
 * yapısal olarak bağlam paketine ya da commit'e giremez (12.9'un "asla girmez" gereksinimi).
 */
export interface AutopilotSecrets {
    telegramBotToken: string;
    telegramChatId: string;
}
export declare function readSecretsFile(home?: string): AutopilotSecrets | null;
/** `mode: 0o600` — sadece sahibi okuyabilir/yazabilir (gizli dosya, roadmap 12.9). */
export declare function writeSecretsFile(secrets: AutopilotSecrets, home?: string): void;
/**
 * Roadmap 12.2 — "ya da ortam değişkeninde": `GRAPHPILOT_TELEGRAM_BOT_TOKEN` ve
 * `GRAPHPILOT_TELEGRAM_CHAT_ID` dosyadan ÖNCE kontrol edilir (CI/konteyner gibi dosya
 * sistemine yazmanın uygun olmadığı ortamlar için).
 */
export declare function loadSecrets(home?: string, env?: NodeJS.ProcessEnv): AutopilotSecrets | null;
