import { existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadSecrets, readSecretsFile, writeSecretsFile } from "../autopilot/secrets.js";

let dir: string;

afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

describe("secrets.ts — roadmap 12.2/12.9", () => {
  it("dosya yoksa null döner (çökmez)", () => {
    dir = mkdtempSync(join(tmpdir(), "gp-secrets-test-"));
    expect(readSecretsFile(dir)).toBeNull();
  });

  it("yazılan secrets.json geri okunabilir", () => {
    dir = mkdtempSync(join(tmpdir(), "gp-secrets-test-"));
    writeSecretsFile({ telegramBotToken: "TOKEN", telegramChatId: "12345" }, dir);
    expect(readSecretsFile(dir)).toEqual({ telegramBotToken: "TOKEN", telegramChatId: "12345" });
  });

  it("~/.graphpilot/ dizini otomatik oluşturulur", () => {
    dir = mkdtempSync(join(tmpdir(), "gp-secrets-test-"));
    writeSecretsFile({ telegramBotToken: "TOKEN", telegramChatId: "12345" }, dir);
    expect(existsSync(join(dir, ".graphpilot"))).toBe(true);
  });

  it("secrets.json sadece sahibi tarafından okunabilir/yazılabilir (mode 0600)", () => {
    dir = mkdtempSync(join(tmpdir(), "gp-secrets-test-"));
    writeSecretsFile({ telegramBotToken: "TOKEN", telegramChatId: "12345" }, dir);
    const mode = statSync(join(dir, ".graphpilot", "secrets.json")).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it("loadSecrets — ortam değişkenleri dosyadan önceliklidir", () => {
    dir = mkdtempSync(join(tmpdir(), "gp-secrets-test-"));
    writeSecretsFile({ telegramBotToken: "FILE-TOKEN", telegramChatId: "1" }, dir);
    const result = loadSecrets(dir, {
      GRAPHPILOT_TELEGRAM_BOT_TOKEN: "ENV-TOKEN",
      GRAPHPILOT_TELEGRAM_CHAT_ID: "2",
    } as NodeJS.ProcessEnv);
    expect(result).toEqual({ telegramBotToken: "ENV-TOKEN", telegramChatId: "2" });
  });

  it("loadSecrets — ortam değişkeni yoksa dosyaya düşer", () => {
    dir = mkdtempSync(join(tmpdir(), "gp-secrets-test-"));
    writeSecretsFile({ telegramBotToken: "FILE-TOKEN", telegramChatId: "1" }, dir);
    expect(loadSecrets(dir, {} as NodeJS.ProcessEnv)).toEqual({
      telegramBotToken: "FILE-TOKEN",
      telegramChatId: "1",
    });
  });

  it("loadSecrets — hiçbiri yoksa null döner", () => {
    dir = mkdtempSync(join(tmpdir(), "gp-secrets-test-"));
    expect(loadSecrets(dir, {} as NodeJS.ProcessEnv)).toBeNull();
  });
});
