import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const binPath = join(here, "../bin.ts");
// `npx tsx` cli/ projesinin KENDİ node_modules'ünü bulsun diye alt süreç cli/ kökünden
// çalıştırılır; hook'un kendi `.graph` yol çözümü tamamen JSON gövdesindeki `cwd`
// alanından gelir (gerçek Claude Code de hook'lara böyle verir) — ikisi bağımsız.
const cliRoot = join(here, "../..");

/**
 * Gerçek `gp hook <ad>` sürecini (tsx ile) stdin'den JSON vererek çalıştırır — hook'un
 * gerçek sözleşmesi budur (Claude Code stdin'e JSON yazar, stdout'tan JSON okur).
 * Pure-function testleri (trimBash.test.ts, trackToolUse.test.ts) mantığı zaten
 * kapsıyor; burada SADECE CLI bağlantısı (stdin okuma, `.graph` yol çözümü,
 * sayaç dosyası okuma/yazma) doğrulanıyor.
 */
function runHook(args: string[], input: unknown): Record<string, unknown> {
  const out = execFileSync("npx", ["tsx", binPath, "hook", ...args], {
    input: JSON.stringify(input),
    cwd: cliRoot,
    encoding: "utf-8",
  });
  return JSON.parse(out || "{}");
}

describe("gp hook trim-bash — gerçek CLI süreci", () => {
  it(".graph yoksa no-op döner", () => {
    const dir = mkdtempSync(join(tmpdir(), "gp-hook-test-"));
    try {
      const out = runHook(["trim-bash"], {
        cwd: dir,
        tool_name: "Bash",
        tool_response: { stdout: "x".repeat(10) },
      });
      expect(out).toEqual({});
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it(".graph + log_trimming:true + uzun çıktı → kırpılmış updatedToolOutput döner", () => {
    const dir = mkdtempSync(join(tmpdir(), "gp-hook-test-"));
    try {
      mkdirSync(join(dir, ".graph"), { recursive: true });
      writeFileSync(
        join(dir, ".graph", "config.yml"),
        [
          "routing: [{ when: {}, model: haiku }]",
          "escalation: [haiku]",
          "max_attempts_per_model: 1",
          "budgets: { default_context: 8000, max_turns: 25 }",
          "optimizations: { log_trimming: true }",
        ].join("\n"),
      );
      const longOutput = Array.from({ length: 100 }, (_, i) => `satır ${i}`).join("\n");
      const out = runHook(["trim-bash"], {
        cwd: dir,
        tool_name: "Bash",
        tool_response: { stdout: longOutput },
      });
      const text = (out.hookSpecificOutput as Record<string, unknown>)?.updatedToolOutput as {
        text: string;
      };
      expect(text.text.split("\n").length).toBe(50);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 20000);
});

describe("gp hook track-tool-use — gerçek CLI süreci", () => {
  it("sayaç dosyasını oluşturur ve 3. tekrarda uyarı döner", () => {
    const dir = mkdtempSync(join(tmpdir(), "gp-hook-test-"));
    try {
      mkdirSync(join(dir, ".graph"), { recursive: true });
      writeFileSync(
        join(dir, ".graph", "config.yml"),
        [
          "routing: [{ when: {}, model: haiku }]",
          "escalation: [haiku]",
          "max_attempts_per_model: 1",
          "budgets: { default_context: 8000, max_turns: 25 }",
        ].join("\n"),
      );
      const input = {
        cwd: dir,
        session_id: "s1",
        tool_name: "Read",
        tool_input: { file_path: "a.ts" },
      };
      runHook(["track-tool-use"], input);
      runHook(["track-tool-use"], input);
      const third = runHook(["track-tool-use"], input);

      const countersPath = join(dir, ".graph", "_runtime", "hook-counters", "s1.json");
      expect(existsSync(countersPath)).toBe(true);
      expect(JSON.parse(readFileSync(countersPath, "utf-8"))["Read:a.ts"]).toBe(3);
      expect(
        (third.hookSpecificOutput as Record<string, unknown>)?.additionalContext,
      ).toContain("a.ts");

      const metricsPath = join(dir, ".graph", "_metrics", "tool-use.jsonl");
      expect(existsSync(metricsPath)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 20000);

  it("Faz 9.7 — touches dışına Write'ta uyarı verir, içine yazarsa vermez", () => {
    const dir = mkdtempSync(join(tmpdir(), "gp-hook-test-"));
    try {
      mkdirSync(join(dir, ".graph", "_runtime"), { recursive: true });
      writeFileSync(
        join(dir, ".graph", "config.yml"),
        [
          "routing: [{ when: {}, model: haiku }]",
          "escalation: [haiku]",
          "max_attempts_per_model: 1",
          "budgets: { default_context: 8000, max_turns: 25 }",
        ].join("\n"),
      );
      writeFileSync(
        join(dir, ".graph", "_runtime", "E01-F01-T01.context.md"),
        ["## node", "", "```yaml", 'id: "E01-F01-T01"', 'touches: ["src/**"]', "```"].join("\n"),
      );

      const outside = runHook(["track-tool-use"], {
        cwd: dir,
        session_id: "s2",
        tool_name: "Write",
        tool_input: { file_path: "other/leaked.ts" },
      });
      expect(
        (outside.hookSpecificOutput as Record<string, unknown>)?.additionalContext,
      ).toContain("touches");

      const inside = runHook(["track-tool-use"], {
        cwd: dir,
        session_id: "s3",
        tool_name: "Write",
        tool_input: { file_path: "src/ok.ts" },
      });
      expect(inside.hookSpecificOutput).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 20000);
});
