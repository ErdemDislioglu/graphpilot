import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
function secretsPath(home) {
    return join(home, ".graphpilot", "secrets.json");
}
export function readSecretsFile(home = homedir()) {
    const path = secretsPath(home);
    if (!existsSync(path))
        return null;
    return JSON.parse(readFileSync(path, "utf-8"));
}
/** `mode: 0o600` — sadece sahibi okuyabilir/yazabilir (gizli dosya, roadmap 12.9). */
export function writeSecretsFile(secrets, home = homedir()) {
    const dir = join(home, ".graphpilot");
    mkdirSync(dir, { recursive: true });
    writeFileSync(secretsPath(home), JSON.stringify(secrets, null, 2), { mode: 0o600 });
}
/**
 * Roadmap 12.2 — "ya da ortam değişkeninde": `GRAPHPILOT_TELEGRAM_BOT_TOKEN` ve
 * `GRAPHPILOT_TELEGRAM_CHAT_ID` dosyadan ÖNCE kontrol edilir (CI/konteyner gibi dosya
 * sistemine yazmanın uygun olmadığı ortamlar için).
 */
export function loadSecrets(home = homedir(), env = process.env) {
    const envToken = env.GRAPHPILOT_TELEGRAM_BOT_TOKEN;
    const envChatId = env.GRAPHPILOT_TELEGRAM_CHAT_ID;
    if (envToken && envChatId)
        return { telegramBotToken: envToken, telegramChatId: envChatId };
    return readSecretsFile(home);
}
