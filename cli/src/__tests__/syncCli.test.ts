import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildCli } from "../cli.js";

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

function setupProject(): string {
  return mkdtempSync(join(tmpdir(), "gp-sync-test-"));
}

const KNOWLEDGE = (hashes: string) =>
  `---\nid: catalog-api\nkind: knowledge\nname: catalog-api\nsummary: s\nscope: epic\nupdated_by: []\nsource_files: ["src/catalog.ts"]\nsource_hashes: ${hashes}\n---\n## Özet\nx\n`;

describe("gp sync — gerçek dosya", () => {
  it("gerçek kod hiç hash'lenmemişse 'never-hashed' raporlar", async () => {
    const dir = setupProject();
    try {
      mkdirSync(join(dir, "src"), { recursive: true });
      writeFileSync(join(dir, "src", "catalog.ts"), "export const x = 1;\n");
      const graphDir = join(dir, ".graph");
      mkdirSync(graphDir, { recursive: true });
      writeFileSync(join(graphDir, "k.md"), KNOWLEDGE("{}"));

      await run(["sync", "--graph-root", graphDir, "--project-root", dir, "--json"]);
      const result = JSON.parse(logs.join("\n"));
      expect(result.reports).toEqual([
        {
          nodeId: "catalog-api",
          files: [{ path: "src/catalog.ts", state: "never-hashed", currentHash: expect.any(String) }],
        },
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("--update-hashes gerçek hash'i yazar, sonraki sync 'ok' döner", async () => {
    const dir = setupProject();
    try {
      mkdirSync(join(dir, "src"), { recursive: true });
      writeFileSync(join(dir, "src", "catalog.ts"), "export const x = 1;\n");
      const graphDir = join(dir, ".graph");
      mkdirSync(graphDir, { recursive: true });
      writeFileSync(join(graphDir, "k.md"), KNOWLEDGE("{}"));

      await run(["sync", "--graph-root", graphDir, "--project-root", dir, "--update-hashes", "--json"]);
      expect(JSON.parse(logs.join("\n")).updated).toEqual(["catalog-api"]);
      expect(readFileSync(join(graphDir, "k.md"), "utf-8")).toContain("src/catalog.ts");

      logs = [];
      await run(["sync", "--graph-root", graphDir, "--project-root", dir, "--json"]);
      expect(JSON.parse(logs.join("\n")).reports).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("hash yazıldıktan sonra kod değişirse 'changed' (şüpheli) raporlar", async () => {
    const dir = setupProject();
    try {
      mkdirSync(join(dir, "src"), { recursive: true });
      writeFileSync(join(dir, "src", "catalog.ts"), "export const x = 1;\n");
      const graphDir = join(dir, ".graph");
      mkdirSync(graphDir, { recursive: true });
      writeFileSync(join(graphDir, "k.md"), KNOWLEDGE("{}"));
      await run(["sync", "--graph-root", graphDir, "--project-root", dir, "--update-hashes", "--json"]);

      // kullanıcı kodu elle değiştirdi — bilgi düğümü güncellenmedi
      writeFileSync(join(dir, "src", "catalog.ts"), "export const x = 2; // değişti\n");

      logs = [];
      await run(["sync", "--graph-root", graphDir, "--project-root", dir, "--json"]);
      const result = JSON.parse(logs.join("\n"));
      expect(result.reports[0].files[0].state).toBe("changed");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("dosya tamamen silinirse 'missing' raporlar, çökmez (9.5 'eksik dosya' toleransı)", async () => {
    const dir = setupProject();
    try {
      const graphDir = join(dir, ".graph");
      mkdirSync(graphDir, { recursive: true });
      // src/catalog.ts hiç oluşturulmadı.
      writeFileSync(join(graphDir, "k.md"), KNOWLEDGE("{}"));

      await run(["sync", "--graph-root", graphDir, "--project-root", dir, "--json"]);
      const result = JSON.parse(logs.join("\n"));
      expect(result.reports[0].files[0]).toEqual({ path: "src/catalog.ts", state: "missing" });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
