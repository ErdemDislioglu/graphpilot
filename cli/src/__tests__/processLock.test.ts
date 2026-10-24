import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkLock, isProcessAlive, readLock, removeLock, writeLock } from "../autopilot/processLock.js";

let dir: string;

afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

describe("processLock — roadmap 12.10", () => {
  it("kilit yoksa readLock null döner", () => {
    dir = mkdtempSync(join(tmpdir(), "gp-lock-test-"));
    expect(readLock(dir)).toBeNull();
  });

  it("writeLock sonrası readLock pid/startedAt'i geri verir", () => {
    dir = mkdtempSync(join(tmpdir(), "gp-lock-test-"));
    writeLock(dir, 12345);
    const info = readLock(dir);
    expect(info?.pid).toBe(12345);
    expect(info?.startedAt).toBeTruthy();
  });

  it("removeLock sonrası readLock null döner", () => {
    dir = mkdtempSync(join(tmpdir(), "gp-lock-test-"));
    writeLock(dir, 1);
    removeLock(dir);
    expect(readLock(dir)).toBeNull();
  });

  it("removeLock hiç kilit yokken çökmez", () => {
    dir = mkdtempSync(join(tmpdir(), "gp-lock-test-"));
    expect(() => removeLock(dir)).not.toThrow();
  });

  it("isProcessAlive — kill çağrısı fırlatmazsa true, fırlatırsa false", () => {
    expect(isProcessAlive(1, () => {})).toBe(true);
    expect(
      isProcessAlive(1, () => {
        throw new Error("ESRCH");
      }),
    ).toBe(false);
  });

  it("checkLock — kilit yok: locked:false, stale:false", () => {
    dir = mkdtempSync(join(tmpdir(), "gp-lock-test-"));
    expect(checkLock(dir)).toEqual({ locked: false, stale: false, info: null });
  });

  it("checkLock — kilit var ve PID canlı: locked:true, stale:false", () => {
    dir = mkdtempSync(join(tmpdir(), "gp-lock-test-"));
    writeLock(dir, 999);
    const result = checkLock(dir, () => true);
    expect(result.locked).toBe(true);
    expect(result.stale).toBe(false);
    expect(result.info?.pid).toBe(999);
  });

  it("checkLock — kilit var ama PID ölü (çökmüş önceki süreç): locked:false, stale:true", () => {
    dir = mkdtempSync(join(tmpdir(), "gp-lock-test-"));
    writeLock(dir, 999);
    const result = checkLock(dir, () => false);
    expect(result.locked).toBe(false);
    expect(result.stale).toBe(true);
  });
});
