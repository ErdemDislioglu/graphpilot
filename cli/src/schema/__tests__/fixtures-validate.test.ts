import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import { parse as parseYaml } from "yaml";
import { describe, expect, it } from "vitest";
import {
  EpicFrontmatterSchema,
  FeatureFrontmatterSchema,
  TaskFrontmatterSchema,
  KnowledgeFrontmatterSchema,
  ConfigSchema,
} from "../index.js";

/**
 * Faz 1 kabul kriteri: "Zod şemaları örnek graph'ı hatasız doğruluyor."
 * Bu dosya GERÇEK bir parser DEĞİL (o Faz 2.2'de yazılır) — sadece örnek graph'taki
 * her .md dosyasının frontmatter'ını okuyup `kind`'a göre doğru şemadan geçirerek
 * kabul kriterini gerçekten çalıştırarak kanıtlayan minimal bir kablolama.
 */

const here = dirname(fileURLToPath(import.meta.url));
const graphRoot = join(here, "../../../../docs/examples/bookstore/.graph");

function listMarkdownFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...listMarkdownFiles(full));
    else if (entry.name.endsWith(".md")) files.push(full);
  }
  return files;
}

describe("örnek bookstore graph — Zod doğrulaması", () => {
  const files = listMarkdownFiles(graphRoot).filter(
    (f) => !f.endsWith("brief.md"), // SPEC §7: brief.md frontmatter'sız, sabit yoldan tanınır
  );

  it("tam 11 düğüm dosyası bulundu (1 epic + 2 feature + 5 task + 3 knowledge)", () => {
    expect(files.length).toBe(11);
  });

  for (const file of files) {
    it(`${file.replace(graphRoot, "")} geçerli frontmatter içeriyor`, () => {
      const raw = readFileSync(file, "utf-8");
      const { data } = matter(raw);

      switch (data.kind) {
        case "epic": {
          const result = EpicFrontmatterSchema.safeParse(data);
          expect(result.success, JSON.stringify(result.success ? null : result.error.issues)).toBe(
            true,
          );
          break;
        }
        case "feature": {
          const result = FeatureFrontmatterSchema.safeParse(data);
          expect(result.success, JSON.stringify(result.success ? null : result.error.issues)).toBe(
            true,
          );
          break;
        }
        case "task": {
          const result = TaskFrontmatterSchema.safeParse(data);
          expect(result.success, JSON.stringify(result.success ? null : result.error.issues)).toBe(
            true,
          );
          break;
        }
        case "knowledge": {
          const result = KnowledgeFrontmatterSchema.safeParse(data);
          expect(result.success, JSON.stringify(result.success ? null : result.error.issues)).toBe(
            true,
          );
          break;
        }
        default:
          throw new Error(`Bilinmeyen kind: ${String(data.kind)} (${file})`);
      }
    });
  }
});

describe("örnek bookstore config.yml — Zod doğrulaması", () => {
  it("config.yml ConfigSchema'dan hatasız geçiyor", () => {
    const raw = readFileSync(join(graphRoot, "config.yml"), "utf-8");
    const parsed = parseYaml(raw);
    const result = ConfigSchema.safeParse(parsed);
    expect(result.success, JSON.stringify(result.success ? null : result.error.issues)).toBe(true);
  });
});

describe("bilinçli hatalı frontmatter — şema gerçekten reddediyor mu", () => {
  it("summary 100 karakteri aşan bir task reddedilir", () => {
    const base = matter(
      readFileSync(join(graphRoot, "E01-catalog/tasks/F01-T01-define-search-types.md"), "utf-8"),
    ).data;
    const broken = { ...base, summary: "x".repeat(101) };
    expect(TaskFrontmatterSchema.safeParse(broken).success).toBe(false);
  });

  it("yanlış biçimli bir task ID'si reddedilir", () => {
    const base = matter(
      readFileSync(join(graphRoot, "E01-catalog/tasks/F01-T01-define-search-types.md"), "utf-8"),
    ).data;
    const broken = { ...base, id: "E1-F01-T01" };
    expect(TaskFrontmatterSchema.safeParse(broken).success).toBe(false);
  });

  it("knowledge düğümünde id !== name reddedilir", () => {
    const base = matter(
      readFileSync(join(graphRoot, "E01-catalog/knowledge/catalog-api.md"), "utf-8"),
    ).data;
    const broken = { ...base, name: "something-else" };
    expect(KnowledgeFrontmatterSchema.safeParse(broken).success).toBe(false);
  });

  it("routing kuralında model: auto reddedilir (routing somut bir model seçmek zorunda)", () => {
    const raw = readFileSync(join(graphRoot, "config.yml"), "utf-8");
    const parsed = parseYaml(raw) as { routing: unknown[] };
    const broken = {
      ...parsed,
      routing: [{ when: { complexity: "low" }, model: "auto" }, ...parsed.routing],
    };
    expect(ConfigSchema.safeParse(broken).success).toBe(false);
  });
});
