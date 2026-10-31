import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

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

/**
 * Kullanıcı isteği (2026-10-31) — her uygulamanın kendi Telegram botu/sohbeti olur (gp ayrı,
 * versoApp ayrı). Proje bilgileri yine ev dizinindeki AYNI gizli dosyada, proje kökünün mutlak
 * yoluyla anahtarlanır (repo'ya hiçbir şey girmez). Üst düzey alanlar eski (global) kayıttır:
 * kendi botu olmayan proje ona düşer. Ayrı bot ayrıca `getUpdates` çakışmasını önler — tek
 * bot iki otopilota bağlanırsa offset küresel olduğu için biri diğerinin buton cevabını yutar.
 */
interface SecretsFile extends Partial<AutopilotSecrets> {
  projects?: Record<string, AutopilotSecrets>;
}

function secretsPath(home: string): string {
  return join(home, ".graphpilot", "secrets.json");
}

/** `.graph` kökünden proje anahtarı: projenin (graph'ın üst dizini) mutlak yolu. */
export function projectKey(graphRoot: string): string {
  return dirname(resolve(graphRoot));
}

function readRaw(home: string): SecretsFile {
  const path = secretsPath(home);
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, "utf-8")) as SecretsFile;
}

function complete(s: Partial<AutopilotSecrets> | undefined): AutopilotSecrets | null {
  if (!s?.telegramBotToken || !s.telegramChatId) return null;
  return { telegramBotToken: s.telegramBotToken, telegramChatId: s.telegramChatId };
}

/** `graphRoot` verilirse yalnız o projenin kaydı; verilmezse global kayıt. */
export function readSecretsFile(home: string = homedir(), graphRoot?: string): AutopilotSecrets | null {
  const raw = readRaw(home);
  return complete(graphRoot ? raw.projects?.[projectKey(graphRoot)] : raw);
}

/** `mode: 0o600` — sadece sahibi okuyabilir/yazabilir (gizli dosya, roadmap 12.9).
 * `graphRoot` verilirse yalnız o projenin kaydı yazılır; diğer projeler ve global korunur. */
export function writeSecretsFile(secrets: AutopilotSecrets, home: string = homedir(), graphRoot?: string): void {
  const dir = join(home, ".graphpilot");
  mkdirSync(dir, { recursive: true });
  const raw = readRaw(home);
  const next: SecretsFile = graphRoot
    ? { ...raw, projects: { ...raw.projects, [projectKey(graphRoot)]: secrets } }
    : { ...raw, ...secrets };
  writeFileSync(secretsPath(home), JSON.stringify(next, null, 2), { mode: 0o600 });
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

/** Proje için kullanılacak bot: projenin kendi kaydı > ortam değişkeni > global kayıt. */
export function loadProjectSecrets(
  graphRoot: string,
  home: string = homedir(),
  env: NodeJS.ProcessEnv = process.env,
): AutopilotSecrets | null {
  return readSecretsFile(home, graphRoot) ?? loadSecrets(home, env);
}
