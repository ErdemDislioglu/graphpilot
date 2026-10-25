import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import matter from "gray-matter";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildRepoMap, writeRepoMap } from "../repomap.js";
import { KnowledgeFrontmatterSchema } from "../schema/index.js";

function withTempProject<T>(files: Record<string, string>, fn: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), "gp-repomap-test-"));
  try {
    for (const [relPath, content] of Object.entries(files)) {
      const full = join(dir, relPath);
      mkdirSync(join(full, ".."), { recursive: true });
      writeFileSync(full, content, "utf-8");
    }
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("buildRepoMap", () => {
  it("TS'te export function/class/const yakalar", () => {
    withTempProject(
      { "src/a.ts": "export function foo() {}\nexport class Bar {}\nexport const baz = 1;\n" },
      (dir) => {
        const { body } = buildRepoMap(dir);
        expect(body).toContain("src/a.ts: foo, Bar, baz");
      },
    );
  });

  it("Python'da def/class yakalar", () => {
    withTempProject({ "a.py": "def foo():\n    pass\n\nclass Bar:\n    pass\n" }, (dir) => {
      const { body } = buildRepoMap(dir);
      expect(body).toContain("a.py: foo, Bar");
    });
  });

  it("Go'da func/type yakalar", () => {
    withTempProject({ "a.go": "func Foo() {}\n\ntype Bar struct{}\n" }, (dir) => {
      const { body } = buildRepoMap(dir);
      expect(body).toContain("a.go: Foo, Bar");
    });
  });

  it("node_modules ve .git her zaman hariç", () => {
    withTempProject(
      {
        "node_modules/pkg/index.ts": "export function shouldNotAppear() {}",
        ".git/hooks/x.ts": "export function shouldNotAppear2() {}",
        "src/a.ts": "export function real() {}",
      },
      (dir) => {
        const { body } = buildRepoMap(dir);
        expect(body).not.toContain("shouldNotAppear");
        expect(body).toContain("src/a.ts: real");
      },
    );
  });

  it(".gitignore'daki dizin hariç tutulur", () => {
    withTempProject(
      {
        ".gitignore": "ignored-dir/\n",
        "ignored-dir/a.ts": "export function hidden() {}",
        "src/a.ts": "export function visible() {}",
      },
      (dir) => {
        const { body } = buildRepoMap(dir);
        expect(body).not.toContain("hidden");
        expect(body).toContain("visible");
      },
    );
  });

  it("Faz 14 B9: sembolsüz dosya yalnız yol olarak listelenir (ör. test dosyaları)", () => {
    withTempProject(
      { "src/empty.ts": "// sadece yorum\n", "src/a.ts": "export function a() {}" },
      (dir) => {
        const { body, fileCount } = buildRepoMap(dir);
        expect(body).toBe("src/a.ts: a\nsrc/empty.ts\n");
        expect(fileCount).toBe(2);
      },
    );
  });

  it("çıktı dosya adına göre deterministik sıralı", () => {
    withTempProject(
      { "b.ts": "export function b() {}", "a.ts": "export function a() {}" },
      (dir) => {
        const { body } = buildRepoMap(dir);
        expect(body.indexOf("a.ts")).toBeLessThan(body.indexOf("b.ts"));
      },
    );
  });
});

describe("writeRepoMap", () => {
  it("geçerli bir knowledge düğümü yazar (KnowledgeFrontmatterSchema'dan geçer)", () => {
    withTempProject({ "src/a.ts": "export function foo() {}" }, (projectDir) => {
      const graphDir = join(projectDir, ".graph");
      const { path, fileCount } = writeRepoMap(projectDir, graphDir);
      expect(fileCount).toBe(1);
      const { data } = matter(readFileSync(path, "utf-8"));
      expect(KnowledgeFrontmatterSchema.safeParse(data).success).toBe(true);
    });
  });
});
