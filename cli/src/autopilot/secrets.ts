import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

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

function secretsPath(home: string): string {
  return join(home, ".graphpilot", "secrets.json");
}

export function readSecretsFile(home: string = homedir()): AutopilotSecrets | null {
  const path = secretsPath(home);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf-8")) as AutopilotSecrets;
}

/** `mode: 0o600` — sadece sahibi okuyabilir/yazabilir (gizli dosya, roadmap 12.9). */
export function writeSecretsFile(secrets: AutopilotSecrets, home: string = homedir()): void {
  const dir = join(home, ".graphpilot");
  mkdirSync(dir, { recursive: true });
  writeFileSync(secretsPath(home), JSON.stringify(secrets, null, 2), { mode: 0o600 });
}

/**
 * Roadmap 12.2 — "ya da ortam değişkeninde": `GRAPHPILOT_TELEGRAM_BOT_TOKEN` ve
 * `GRAPHPILOT_TELEGRAM_CHAT_ID` dosyadan ÖNCE kontrol edilir (CI/konteyner gibi dosya
 * sistemine yazmanın uygun olmadığı ortamlar için).
 */
export function loadSecrets(
  home: string = homedir(),
  env: NodeJS.ProcessEnv = process.env,
): AutopilotSecrets | null {
  const envToken = env.GRAPHPILOT_TELEGRAM_BOT_TOKEN;
  const envChatId = env.GRAPHPILOT_TELEGRAM_CHAT_ID;
  if (envToken && envChatId) return { telegramBotToken: envToken, telegramChatId: envChatId };
  return readSecretsFile(home);
}
