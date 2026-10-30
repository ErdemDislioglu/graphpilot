import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { computeRunGuard, isGuardedCommand, readContextTokens } from "../hooks/runGuard.js";

const assistant = (sessionId: string, read: number, extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    type: "assistant",
    sessionId,
    message: { model: "claude-x", usage: { input_tokens: 10, cache_read_input_tokens: read, cache_creation_input_tokens: 90 } },
    ...extra,
  });

function withTranscript<T>(lines: string[], fn: (path: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), "gp-runguard-"));
  try {
    const path = join(dir, "s.jsonl");
    writeFileSync(path, lines.join("\n") + "\n");
    return fn(path);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("isGuardedCommand — Faz 15", () => {
  it("gp:run ve gp:team'i command_name'den ya da yazılan satırdan tanır", () => {
    expect(isGuardedCommand({ command_name: "gp:run" })).toBe(true);
    expect(isGuardedCommand({ prompt: "/gp:team --epic E02" })).toBe(true);
    expect(isGuardedCommand({ command_name: "gp:plan", prompt: "/gp:plan x" })).toBe(false);
  });
});

describe("readContextTokens — Faz 15", () => {
  it("bu oturumun son ana-thread assistant mesajının girdi token'ları; sidechain ve başka oturum sayılmaz", () => {
    const lines = [
      assistant("s1", 1000),
      assistant("s1", 80_000),
      assistant("s1", 5, { isSidechain: true }),
      assistant("eski", 500_000),
      "bozuk satır {",
    ];
    withTranscript(lines, (path) => {
      expect(readContextTokens(path, "s1")).toBe(80_100);
      expect(readContextTokens(path, "yeni-oturum")).toBe(0);
    });
  });

  it("dosya yoksa 0", () => {
    expect(readContextTokens("/yok/yok.jsonl")).toBe(0);
  });
});

describe("computeRunGuard — Faz 15", () => {
  const opts = (tokens: number) => ({ graphDirExists: true, thresholdTokens: 70_000, contextTokens: () => tokens });
  const input = { command_name: "gp:run", prompt: "/gp:run", transcript_path: "/t.jsonl", session_id: "s" };

  it("eşik aşılırsa /clear önererek durdurur", () => {
    const out = computeRunGuard(input, opts(95_400));
    expect(out).toMatchObject({ decision: "block" });
    expect((out as { reason: string }).reason).toContain("~95k");
    expect((out as { reason: string }).reason).toContain("/clear");
  });

  it("kısa oturum, --force, başka komut, .graph yok ya da ayar 0 → geçer", () => {
    expect(computeRunGuard(input, opts(40_000))).toEqual({});
    expect(computeRunGuard({ ...input, prompt: "/gp:run --force" }, opts(200_000))).toEqual({});
    expect(computeRunGuard({ ...input, command_name: "gp:status", prompt: "/gp:status" }, opts(200_000))).toEqual({});
    expect(computeRunGuard(input, { ...opts(200_000), graphDirExists: false })).toEqual({});
    expect(computeRunGuard(input, { ...opts(200_000), thresholdTokens: 0 })).toEqual({});
  });
});
