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
      expect(running).toEqual([
        { nodeId: "E01-F01-T01", touches: ["src/**", "test/a.js"], allowed: [] },
      ]);

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

describe("Faz 14 B5/B6 — yalnız running düğümler, kendi dosyası ve reads izinli", () => {
  const CONTEXT = (id: string, reads: string[] = []) =>
    [
      "## node",
      "",
      "```yaml",
      `id: ${JSON.stringify(id)}`,
      'touches: ["src/**"]',
      `reads: ${JSON.stringify(reads)}`,
      "```",
      "",
    ].join("\n");
  const TASK_FILE = (id: string, status: string) => `---\nid: "${id}"\nkind: "task"\nstatus: ${status}\n---\n## Handoff\n`;

  function setup(): { root: string; graphDir: string } {
    const root = mkdtempSync(join(tmpdir(), "gp-touchesguard-b5-"));
    const graphDir = join(root, ".graph");
    mkdirSync(join(graphDir, "_runtime"), { recursive: true });
    mkdirSync(join(graphDir, "E01-x", "tasks"), { recursive: true });
    return { root, graphDir };
  }

  it("bitmiş (done) düğümün kalıntı context dosyası sayılmaz", () => {
    const { root, graphDir } = setup();
    try {
      writeFileSync(join(graphDir, "_runtime", "E01-F01-T01.context.md"), CONTEXT("E01-F01-T01"));
      writeFileSync(join(graphDir, "E01-x", "tasks", "F01-T01-a.md"), TASK_FILE("E01-F01-T01", "done"));
      writeFileSync(join(graphDir, "_runtime", "E01-F01-T02.context.md"), CONTEXT("E01-F01-T02"));
      writeFileSync(join(graphDir, "E01-x", "tasks", "F01-T02-b.md"), TASK_FILE("E01-F01-T02", '"running"'));
      const running = readRunningNodesTouches(graphDir);
      expect(running.map((n) => n.nodeId)).toEqual(["E01-F01-T02"]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("kendi düğüm dosyası ve reads'teki bilgi düğümleri ihlal sayılmaz; başkası sayılır", () => {
    const { root, graphDir } = setup();
    try {
      writeFileSync(
        join(graphDir, "_runtime", "E01-F01-T01.context.md"),
        CONTEXT("E01-F01-T01", ["[[http-helpers]]"]),
      );
      writeFileSync(join(graphDir, "E01-x", "tasks", "F01-T01-a.md"), TASK_FILE("E01-F01-T01", "running"));
      const running = readRunningNodesTouches(graphDir);
      expect(running[0].allowed).toEqual([
        ".graph/E01-x/tasks/F01-T01-a.md",
        ".graph/**/knowledge/http-helpers.md",
      ]);
      expect(checkTouchesViolation(".graph/E01-x/tasks/F01-T01-a.md", running)).toBeNull();
      expect(checkTouchesViolation(".graph/_shared/knowledge/http-helpers.md", running)).toBeNull();
      expect(checkTouchesViolation(".graph/E01-x/knowledge/http-helpers.md", running)).toBeNull();
      expect(checkTouchesViolation(".graph/_shared/knowledge/baska.md", running)).not.toBeNull();
      expect(checkTouchesViolation(".graph/E01-x/tasks/F01-T02-b.md", running)).not.toBeNull();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("proje kökü dışındaki yollar kontrol edilmez", () => {
    const running = [{ nodeId: "E01-F01-T01", touches: ["src/**"], allowed: [] }];
    expect(checkTouchesViolation("../../.claude/projects/x/memory/a.md", running)).toBeNull();
    expect(checkTouchesViolation("/Users/x/.claude/memory/a.md", running)).toBeNull();
    expect(checkTouchesViolation("lib/a.js", running)).not.toBeNull();
  });
});
