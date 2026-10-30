import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { extractAcceptanceCriteria, readGitDiff, runAcceptanceCheck } from "../check.js";

describe("runAcceptanceCheck — mock spawner", () => {
  it("başarılı structured_output'u ayrıştırır", () => {
    const result = runAcceptanceCheck("- A çalışmalı\n- B çalışmalı", "diff içeriği", {
      spawner: () =>
        ({
          stdout: JSON.stringify({
            structured_output: {
              results: [
                { kriter: "A çalışmalı", durum: "ok", not: "test geçti" },
                { kriter: "B çalışmalı", durum: "eksik", not: "test yok" },
              ],
            },
          }),
          status: 0,
        }) as const,
    });
    expect(result.success).toBe(true);
    expect(result.results).toHaveLength(2);
    expect(result.results[1].durum).toBe("eksik");
  });

  it("structured_output alanı YOKSA success:false döner — 'ok' saymaz (ADR-008)", () => {
    const result = runAcceptanceCheck("kriter", "diff", {
      spawner: () => ({ stdout: JSON.stringify({ result: "model reddetti" }), status: 0 }),
    });
    expect(result.success).toBe(false);
    expect(result.results).toEqual([]);
    expect(result.error).toContain("structured_output");
  });

  it("claude -p çağrısı geçersiz JSON döndürürse success:false döner, çökmez", () => {
    const result = runAcceptanceCheck("kriter", "diff", {
      spawner: () => ({ stdout: "bu JSON değil {{{", status: 1 }),
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("başarısız");
  });

  it("--model verilirse spawner'a argüman olarak geçer", () => {
    let capturedArgs: string[] = [];
    runAcceptanceCheck("kriter", "diff", {
      model: "haiku",
      spawner: (args) => {
        capturedArgs = args;
        return { stdout: JSON.stringify({ structured_output: { results: [] } }), status: 0 };
      },
    });
    expect(capturedArgs).toContain("--model");
    expect(capturedArgs).toContain("haiku");
    expect(capturedArgs).toContain("--json-schema");
    expect(capturedArgs).toContain("--strict-mcp-config");
    expect(capturedArgs).toContain("--disable-slash-commands");
  });

  it("boş results dizisi de geçerli bir başarı sayılır (tüm kriterler kontrol edildi, 0 kriter değil)", () => {
    const result = runAcceptanceCheck("kriter", "diff", {
      spawner: () => ({
        stdout: JSON.stringify({ structured_output: { results: [] } }),
        status: 0,
      }),
    });
    expect(result.success).toBe(true);
    expect(result.results).toEqual([]);
  });
});

describe("extractAcceptanceCriteria", () => {
  it("## Kabul kriterleri bölümünü döndürür", () => {
    const task = { body: "## Görev\nx\n\n## Kabul kriterleri\n- A\n- B\n" } as Parameters<
      typeof extractAcceptanceCriteria
    >[0];
    expect(extractAcceptanceCriteria(task)).toBe("- A\n- B");
  });
});

describe("readGitDiff — Faz 14 B1", () => {
  const dirs: string[] = [];
  const tempDir = () => {
    const dir = mkdtempSync(join(tmpdir(), "gp-check-"));
    dirs.push(dir);
    return dir;
  };
  const git = (cwd: string, ...args: string[]) =>
    execFileSync("git", args, { cwd, stdio: "pipe", encoding: "utf-8" });
  const initRepo = (dir: string) => {
    git(dir, "init", "-q");
    git(dir, "config", "user.email", "test@example.com");
    git(dir, "config", "user.name", "test");
  };

  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it("git deposu dışında ok:false ve neden döner (eskiden boş stdout + usage metni)", () => {
    const result = readGitDiff(tempDir());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("git deposu değil");
  });

  it("henüz commit'i olmayan depoda ok:false döner (git init sonrası)", () => {
    const dir = tempDir();
    initRepo(dir);
    const result = readGitDiff(dir);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("HEAD yok");
  });

  it("commit'li depoda HEAD'e göre diff'i döner", () => {
    const dir = tempDir();
    initRepo(dir);
    writeFileSync(join(dir, "a.txt"), "eski\n");
    git(dir, "add", ".");
    git(dir, "commit", "-q", "-m", "ilk");
    writeFileSync(join(dir, "a.txt"), "yeni\n");
    const result = readGitDiff(dir);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.diff).toContain("+yeni");
  });

  it("git diff başarısızsa ok:false döner (enjekte runner)", () => {
    const result = readGitDiff(".", (args) =>
      args[0] === "diff" ? { stdout: "", status: 128 } : { stdout: "true\n", status: 0 },
    );
    expect(result).toEqual({ ok: false, reason: "git diff HEAD başarısız (exit 128)" });
  });
});
