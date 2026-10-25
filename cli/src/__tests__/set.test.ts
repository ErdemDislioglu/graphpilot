import { readFileSync } from "node:fs";
import matter from "gray-matter";
import { describe, expect, it } from "vitest";
import { setFrontmatter } from "../set.js";
import { withTempGraph } from "../testUtils/tempGraph.js";

const TASK = (overrides: Record<string, unknown>) => ({
  id: "E01-F01-T01",
  kind: "task",
  name: "a",
  level: 3,
  summary: "s",
  type: "feature",
  complexity: "low",
  risk: "low",
  context_size: "small",
  model: "auto",
  agent: "auto",
  context_budget: 8000,
  status: "pending",
  attempts: 0,
  ...overrides,
});

function frontmatter(obj: Record<string, unknown>): string {
  const lines = Object.entries(obj).map(([k, v]) => `${k}: ${JSON.stringify(v)}`);
  return `---\n${lines.join("\n")}\n---\n## Görev\nx\n`;
}

describe("setFrontmatter", () => {
  it("status=done, attempts=1 — string'ler mevcut alan tipine göre koerse edilir", () => {
    withTempGraph({ "a.md": frontmatter(TASK({})) }, (graph, dir) => {
      const result = setFrontmatter(graph, "E01-F01-T01", { status: "done", attempts: "1" });
      expect(result.ok).toBe(true);

      const after = matter(readFileSync(`${dir}/a.md`, "utf-8"));
      expect(after.data.status).toBe("done");
      expect(after.data.attempts).toBe(1); // sayıya koerse edildi, string "1" değil
      expect(typeof after.data.attempts).toBe("number");
    });
  });

  it("gövdeye dokunmaz", () => {
    withTempGraph({ "a.md": frontmatter(TASK({})) }, (graph, dir) => {
      setFrontmatter(graph, "E01-F01-T01", { status: "done" });
      const after = matter(readFileSync(`${dir}/a.md`, "utf-8"));
      expect(after.content.trim()).toBe("## Görev\nx");
    });
  });

  it("geçersiz değer yazmaz — hata listesiyle geri döner, dosya değişmez", () => {
    withTempGraph({ "a.md": frontmatter(TASK({})) }, (graph, dir) => {
      const before = readFileSync(`${dir}/a.md`, "utf-8");
      const result = setFrontmatter(graph, "E01-F01-T01", { status: "boyle-bir-durum-yok" });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.length).toBeGreaterThan(0);
      expect(readFileSync(`${dir}/a.md`, "utf-8")).toBe(before);
    });
  });

  it("var olmayan düğüm id'si hata döner", () => {
    withTempGraph({ "a.md": frontmatter(TASK({})) }, (graph) => {
      const result = setFrontmatter(graph, "E99-T99", { status: "done" });
      expect(result.ok).toBe(false);
    });
  });

  it("Faz 14 B7c: liste alanları a,b ve JSON sözdizimini kabul eder; reads çıplak adı [[ad]] yapar", () => {
    withTempGraph(
      {
        "a.md": frontmatter(TASK({})),
        "b.md": frontmatter(TASK({ id: "E01-F01-T02", name: "b" })),
        "k.md": `---\nid: "x"\nkind: "knowledge"\nname: "x"\nsummary: "s"\nscope: "shared"\nupdated_by: []\n---\n`,
      },
      (graph, dir) => {
        expect(setFrontmatter(graph, "E01-F01-T02", { depends_on: "E01-F01-T01", reads: "x" }).ok).toBe(true);
        expect(setFrontmatter(graph, "E01-F01-T01", { tags: '["auth","security"]', touches: "" }).ok).toBe(true);
        expect(setFrontmatter(graph, "x", { updated_by: "E01-F01-T01,E01-F01-T02" }).ok).toBe(true);
        const b = matter(readFileSync(`${dir}/b.md`, "utf-8") + " ").data;
        expect(b.depends_on).toEqual(["E01-F01-T01"]);
        expect(b.reads).toEqual(["[[x]]"]);
        const a = matter(readFileSync(`${dir}/a.md`, "utf-8") + " ").data;
        expect(a.tags).toEqual(["auth", "security"]);
        expect(a.touches).toEqual([]);
        expect(matter(readFileSync(`${dir}/k.md`, "utf-8") + " ").data.updated_by).toEqual([
          "E01-F01-T01",
          "E01-F01-T02",
        ]);
      },
    );
  });

  it("Faz 14 B7d: yalnız değişen satır yeniden yazılır; diğer satırlar ve varsayılanlar eklenmez", () => {
    const original =
      '---\nid: "E01-F01-T01"\nkind: "task"\nname: "a"\nlevel: 3\nsummary: "s, tırnaklı: özet"\ntype: "feature"\ncomplexity: "low"\nrisk: "low"\ncontext_size: "small"\nmodel: "auto"\nagent: "auto"\ntouches:\n  - src/a.js\n  - src/b.js\ncontext_budget: 8000\nstatus: "pending"\nattempts: 0\n---\n## Görev\nx\n';
    withTempGraph({ "a.md": original }, (graph, dir) => {
      expect(setFrontmatter(graph, "E01-F01-T01", { status: "done", touches: "src/c.js" }).ok).toBe(true);
      expect(readFileSync(`${dir}/a.md`, "utf-8")).toBe(
        original
          .replace('status: "pending"', 'status: "done"')
          .replace("touches:\n  - src/a.js\n  - src/b.js", 'touches: ["src/c.js"]'),
      );
    });
  });

  it("Faz 14 B7c: geçersiz JSON liste dosyayı değiştirmez", () => {
    withTempGraph({ "a.md": frontmatter(TASK({})) }, (graph, dir) => {
      const before = readFileSync(`${dir}/a.md`, "utf-8");
      expect(setFrontmatter(graph, "E01-F01-T01", { depends_on: "[bozuk" }).ok).toBe(false);
      expect(readFileSync(`${dir}/a.md`, "utf-8")).toBe(before);
    });
  });
});
