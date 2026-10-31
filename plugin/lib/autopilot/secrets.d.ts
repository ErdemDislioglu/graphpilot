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
/** `.graph` kökünden proje anahtarı: projenin (graph'ın üst dizini) mutlak yolu. */
export declare function projectKey(graphRoot: string): string;
/** `graphRoot` verilirse yalnız o projenin kaydı; verilmezse global kayıt. */
export declare function readSecretsFile(home?: string, graphRoot?: string): AutopilotSecrets | null;
/** `mode: 0o600` — sadece sahibi okuyabilir/yazabilir (gizli dosya, roadmap 12.9).
 * `graphRoot` verilirse yalnız o projenin kaydı yazılır; diğer projeler ve global korunur. */
export declare function writeSecretsFile(secrets: AutopilotSecrets, home?: string, graphRoot?: string): void;
/**
 * Roadmap 12.2 — "ya da ortam değişkeninde": `GRAPHPILOT_TELEGRAM_BOT_TOKEN` ve
 * `GRAPHPILOT_TELEGRAM_CHAT_ID` dosyadan ÖNCE kontrol edilir (CI/konteyner gibi dosya
 * sistemine yazmanın uygun olmadığı ortamlar için).
 */
export declare function loadSecrets(home?: string, env?: NodeJS.ProcessEnv): AutopilotSecrets | null;
/** Proje için kullanılacak bot: projenin kendi kaydı > ortam değişkeni > global kayıt. */
export declare function loadProjectSecrets(graphRoot: string, home?: string, env?: NodeJS.ProcessEnv): AutopilotSecrets | null;
