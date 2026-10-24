import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  checkTouchesViolation,
  globToRegExp,
  matchesAnyTouches,
  readRunningNodesTouches,
} from "../hooks/touchesGuard.js";

describe("globToRegExp / matchesAnyTouches", () => {
  it("'src/**' tüm alt yolları kapsar", () => {
    expect(matchesAnyTouches("src/a/b.ts", ["src/**"])).toBe(true);
    expect(matchesAnyTouches("src/a.ts", ["src/**"])).toBe(true);
    expect(matchesAnyTouches("other/a.ts", ["src/**"])).toBe(false);
  });

  it("'*' ayraç sınırını aşmaz", () => {
    expect(matchesAnyTouches("src/a.ts", ["src/*.ts"])).toBe(true);
    expect(matchesAnyTouches("src/sub/a.ts", ["src/*.ts"])).toBe(false);
  });

  it("tam dosya yolu (glob yok) birebir eşleşir", () => {
    expect(matchesAnyTouches("src/server.test.js", ["src/server.test.js"])).toBe(true);
    expect(matchesAnyTouches("src/server.js", ["src/server.test.js"])).toBe(false);
  });

  it("birden fazla desenden biri eşleşse yeterli", () => {
    expect(matchesAnyTouches("test/a.js", ["src/**", "test/**"])).toBe(true);
  });

  it("globToRegExp özel regex karakterlerini kaçışlar (ör. '.')", () => {
    expect(globToRegExp("a.b").test("aXb")).toBe(false);
    expect(globToRegExp("a.b").test("a.b")).toBe(true);
  });
});

describe("readRunningNodesTouches + checkTouchesViolation", () => {
  function tempGraphDir(): string {
    return mkdtempSync(join(tmpdir(), "gp-touchesguard-test-"));
  }

  it("_runtime yoksa boş liste döner, kontrol atlanır (çökmez)", () => {
    const dir = tempGraphDir();
    try {
      expect(readRunningNodesTouches(dir)).toEqual([]);
      expect(checkTouchesViolation("src/a.ts", [])).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("gerçek bir context.md dosyasından touches'ı doğru çıkarır", () => {
    const dir = tempGraphDir();
    try {
      mkdirSync(join(dir, "_runtime"), { recursive: true });
      writeFileSync(
        join(dir, "_runtime", "E01-F01-T01.context.md"),
        [
          "## brief",
          "",
          "içerik",
          "",
          "---",
          "",
          "## node",
          "",
          "```yaml",
          'id: "E01-F01-T01"',
          'touches: ["src/**", "test/a.js"]',
          "```",
          "",
          "## Görev",
          "x",
        ].join("\n"),
      );
      const running = readRunningNodesTouches(dir);
      expect(running).toEqual([{ nodeId: "E01-F01-T01", touches: ["src/**", "test/a.js"] }]);

      expect(checkTouchesViolation("src/ok.ts", running)).toBeNull();
      expect(checkTouchesViolation("other/not-covered.ts", running)).toEqual({
        path: "other/not-covered.ts",
        checkedAgainst: running,
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("bozuk/eksik context.md dosyasını yoksayar, çökmez", () => {
    const dir = tempGraphDir();
    try {
      mkdirSync(join(dir, "_runtime"), { recursive: true });
      writeFileSync(join(dir, "_runtime", "bozuk.context.md"), "bu bir context dosyası değil");
      expect(readRunningNodesTouches(dir)).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
