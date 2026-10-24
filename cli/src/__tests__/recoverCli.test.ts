import { execSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildCli } from "../cli.js";

/**
 * `gp recover`'ın asıl mantığı (`decideRunningNodeRecovery`/`findOrphanWipCommits`)
 * `recover.test.ts`'te saf fonksiyon olarak test edildi. Burada SADECE CLI'nın gerçek
 * git ile doğru konuştuğunu doğruluyoruz — gerçek `git init`/commit/restore.
 */
let logs: string[] = [];
beforeEach(() => {
  logs = [];
  vi.spyOn(console, "log").mockImplementation((msg) => logs.push(String(msg)));
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = undefined;
});

async function run(args: string[]): Promise<void> {
  const program = buildCli();
  program.exitOverride();
  await program.parseAsync(["node", "gp", ...args]);
}

const TASK = (overrides: Record<string, unknown>) => ({
  kind: "task",
  level: 3,
  summary: "s",
  type: "feature",
  complexity: "low",
  risk: "low",
  context_size: "small",
  model: "auto",
  agent: "auto",
  context_budget: 8000,
  status: "running",
  attempts: 0,
  ...overrides,
});

function frontmatter(obj: Record<string, unknown>, body: string): string {
  const lines = Object.entries(obj).map(([k, v]) => `${k}: ${JSON.stringify(v)}`);
  return `---\n${lines.join("\n")}\n---\n${body}`;
}

function setupGitProject(): string {
  const dir = mkdtempSync(join(tmpdir(), "gp-recover-test-"));
  execSync("git init -q", { cwd: dir });
  execSync('git config user.email "t@t.com" && git config user.name "t"', { cwd: dir });
  return dir;
}

describe("gp recover — gerçek git", () => {
  it("'## Yarım iş' notu olmayan running düğümün commit'lenmemiş değişiklikleri geri alınır, pending'e döner", () => {
    return (async () => {
      const dir = setupGitProject();
      try {
        mkdirSync(join(dir, "src"), { recursive: true });
        writeFileSync(join(dir, "src", "a.js"), "eski içerik\n");
        execSync("git add -A && git commit -q -m init", { cwd: dir });
        writeFileSync(join(dir, "src", "a.js"), "yarım kalmış değişiklik\n");

        const graphDir = join(dir, ".graph");
        mkdirSync(graphDir, { recursive: true });
        writeFileSync(
          join(graphDir, "a.md"),
          frontmatter(
            TASK({ id: "E01-F01-T01", name: "a", touches: ["src/**"] }),
            "## Görev\nx\n\n## Handoff\n*(Henüz çalıştırılmadı.)*\n",
          ),
        );

        await run(["recover", "--graph-root", graphDir, "--project-root", dir, "--json"]);
        const result = JSON.parse(logs.join("\n"));
        expect(result.decisions).toEqual([
          {
            nodeId: "E01-F01-T01",
            action: "revert",
            reason: "## Yarım iş notu yok — commit'lenmemiş değişiklik (varsa) geri alınıp pending'e dönecek",
          },
        ]);
        expect(result.applied).toEqual([{ nodeId: "E01-F01-T01", action: "geri alındı → pending" }]);
        expect(readFileSync(join(dir, "src", "a.js"), "utf-8")).toBe("eski içerik\n");
        // setFrontmatter yazarken gray-matter/js-yaml düz string'leri tırnaksız yazar
        // (test fixture'ının kendi JSON.stringify'lı yazımından farklı) — gerçek davranış.
        expect(readFileSync(join(graphDir, "a.md"), "utf-8")).toMatch(/status: pending\b/);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    })();
  });

  it("'## Yarım iş' notu OLAN running düğüme dokunmaz (dosyası ve status'u korunur)", () => {
    return (async () => {
      const dir = setupGitProject();
      try {
        mkdirSync(join(dir, "src"), { recursive: true });
        writeFileSync(join(dir, "src", "a.js"), "eski\n");
        execSync("git add -A && git commit -q -m init", { cwd: dir });
        writeFileSync(join(dir, "src", "a.js"), "devam edecek yarım iş\n");

        const graphDir = join(dir, ".graph");
        mkdirSync(graphDir, { recursive: true });
        writeFileSync(
          join(graphDir, "a.md"),
          frontmatter(
            TASK({ id: "E01-F01-T01", name: "a", touches: ["src/**"] }),
            "## Görev\nx\n\n## Yarım iş\n\nstore.js bitti, server.js kaldı.\n",
          ),
        );

        await run(["recover", "--graph-root", graphDir, "--project-root", dir, "--json"]);
        const result = JSON.parse(logs.join("\n"));
        expect(result.decisions[0].action).toBe("resume");
        expect(result.applied).toEqual([]);
        expect(readFileSync(join(dir, "src", "a.js"), "utf-8")).toBe("devam edecek yarım iş\n");
        expect(readFileSync(join(graphDir, "a.md"), "utf-8")).toContain('status: "running"');
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    })();
  });

  it("--dry-run hiçbir şeyi değiştirmez, sadece raporlar", () => {
    return (async () => {
      const dir = setupGitProject();
      try {
        mkdirSync(join(dir, "src"), { recursive: true });
        writeFileSync(join(dir, "src", "a.js"), "eski\n");
        execSync("git add -A && git commit -q -m init", { cwd: dir });
        writeFileSync(join(dir, "src", "a.js"), "değişti\n");

        const graphDir = join(dir, ".graph");
        mkdirSync(graphDir, { recursive: true });
        writeFileSync(
          join(graphDir, "a.md"),
          frontmatter(TASK({ id: "E01-F01-T01", name: "a", touches: ["src/**"] }), "## Görev\nx\n"),
        );

        await run([
          "recover",
          "--graph-root",
          graphDir,
          "--project-root",
          dir,
          "--dry-run",
          "--json",
        ]);
        const result = JSON.parse(logs.join("\n"));
        expect(result.applied).toEqual([
          { nodeId: "E01-F01-T01", action: "revert (dry-run, uygulanmadı)" },
        ]);
        expect(readFileSync(join(dir, "src", "a.js"), "utf-8")).toBe("değişti\n");
        expect(readFileSync(join(graphDir, "a.md"), "utf-8")).toContain('status: "running"');
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    })();
  });

  it("yetim WIP commit'i (resume edilmeyen bir düğümün) tespit eder", () => {
    return (async () => {
      const dir = setupGitProject();
      try {
        writeFileSync(join(dir, "README.md"), "x\n");
        execSync("git add -A && git commit -q -m init", { cwd: dir });
        execSync('git commit -q --allow-empty -m "gp-wip(E01-F01-T02): tur 1"', { cwd: dir });

        const graphDir = join(dir, ".graph");
        mkdirSync(graphDir, { recursive: true });
        // Hiç running düğüm yok — bu yüzden T02'nin WIP commit'i kesinlikle yetim.
        await run(["recover", "--graph-root", graphDir, "--project-root", dir, "--json"]);
        const result = JSON.parse(logs.join("\n"));
        expect(result.orphanWip).toEqual(["gp-wip(E01-F01-T02): tur 1"]);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    })();
  });
});
