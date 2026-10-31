import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
function secretsPath(home) {
    return join(home, ".graphpilot", "secrets.json");
}
/** `.graph` kökünden proje anahtarı: projenin (graph'ın üst dizini) mutlak yolu. */
export function projectKey(graphRoot) {
    return dirname(resolve(graphRoot));
}
function readRaw(home) {
    const path = secretsPath(home);
    if (!existsSync(path))
        return {};
    return JSON.parse(readFileSync(path, "utf-8"));
}
function complete(s) {
    if (!s?.telegramBotToken || !s.telegramChatId)
        return null;
    return { telegramBotToken: s.telegramBotToken, telegramChatId: s.telegramChatId };
}
/** `graphRoot` verilirse yalnız o projenin kaydı; verilmezse global kayıt. */
export function readSecretsFile(home = homedir(), graphRoot) {
    const raw = readRaw(home);
    return complete(graphRoot ? raw.projects?.[projectKey(graphRoot)] : raw);
}
/** `mode: 0o600` — sadece sahibi okuyabilir/yazabilir (gizli dosya, roadmap 12.9).
 * `graphRoot` verilirse yalnız o projenin kaydı yazılır; diğer projeler ve global korunur. */
export function writeSecretsFile(secrets, home = homedir(), graphRoot) {
    const dir = join(home, ".graphpilot");
    mkdirSync(dir, { recursive: true });
    const raw = readRaw(home);
    const next = graphRoot
        ? { ...raw, projects: { ...raw.projects, [projectKey(graphRoot)]: secrets } }
        : { ...raw, ...secrets };
    writeFileSync(secretsPath(home), JSON.stringify(next, null, 2), { mode: 0o600 });
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
/** Proje için kullanılacak bot: projenin kendi kaydı > ortam değişkeni > global kayıt. */
export function loadProjectSecrets(graphRoot, home = homedir(), env = process.env) {
    return readSecretsFile(home, graphRoot) ?? loadSecrets(home, env);
}
