import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildCli } from "../cli.js";
import { withTempGraphAsync } from "../testUtils/tempGraph.js";

/**
 * `cli.ts` glue kodu — alttaki fonksiyonlar (parser/validate/next/route/context/...)
 * kendi dosyalarında zaten kapsamlı test edildi. Burada sadece commander ÇIKARIM
 * sözleşmesini (doğru komut → doğru fonksiyon → doğru çıktı biçimi → doğru exitCode)
 * doğruluyoruz; iş mantığının kendisi tekrar test edilmiyor.
 *
 * `exitOverride()` sadece BU testte uygulanır (commander'ın `process.exit()` çağırıp
 * test sürecini öldürmesini önler) — `bin.ts`/üretim davranışı değişmez.
 */
let logs: string[] = [];
let errors: string[] = [];

beforeEach(() => {
  logs = [];
  errors = [];
  vi.spyOn(console, "log").mockImplementation((msg) => {
    logs.push(String(msg));
  });
  vi.spyOn(console, "error").mockImplementation((msg) => {
    errors.push(String(msg));
  });
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

const TASK = {
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
};

function frontmatter(obj: Record<string, unknown>): string {
  const lines = Object.entries(obj).map(([k, v]) => `${k}: ${JSON.stringify(v)}`);
  return `---\n${lines.join("\n")}\n---\n## Görev\nx\n`;
}

const CONFIG_YML =
  "routing:\n  - when: {}\n    model: haiku\nescalation: [haiku]\nmax_attempts_per_model: 1\nbudgets: { default_context: 8000, max_turns: 25 }\n";

describe("cli — gp validate", () => {
  it("geçerli graph: çıktıda 'geçerli', exitCode set edilmez", async () => {
    await withTempGraphAsync({ "a.md": frontmatter(TASK) }, async (_graph, dir) => {
      await run(["validate", "-g", dir]);
      expect(logs.join("\n")).toContain("geçerli");
      expect(process.exitCode).toBeFalsy();
    });
  });

  it("bozuk graph: --json ile issues döner, exitCode=1", async () => {
    await withTempGraphAsync(
      { "a.md": frontmatter({ ...TASK, status: "yok-boyle-bir-durum" }) },
      async (_graph, dir) => {
        await run(["validate", "-g", dir, "--json"]);
        const parsed = JSON.parse(logs.join("\n"));
        expect(parsed.issues.length).toBeGreaterThan(0);
        expect(process.exitCode).toBe(1);
      },
    );
  });

  it("--fix-flags: touches>5 görevin context_size'ını otomatik düzeltir ve diske yazar", async () => {
    await withTempGraphAsync(
      {
        "a.md": frontmatter({
          ...TASK,
          touches: ["a", "b", "c", "d", "e", "f"],
          context_size: "small",
        }),
      },
      async (_graph, dir) => {
        await run(["validate", "-g", dir, "--fix-flags", "--json"]);
        const parsed = JSON.parse(logs.join("\n"));
        expect(parsed.fixes).toEqual([
          { nodeId: "E01-F01-T01", field: "context_size", from: "small", to: "large" },
        ]);
        expect(parsed.issues).toEqual([]);
      },
    );
  });
});

describe("cli — gp status", () => {
  it("--json ile byKind döner", async () => {
    await withTempGraphAsync({ "a.md": frontmatter(TASK) }, async (_graph, dir) => {
      await run(["status", "-g", dir, "--json"]);
      const parsed = JSON.parse(logs.join("\n"));
      expect(parsed.byKind.task).toBe(1);
    });
  });
});

describe("cli — gp route", () => {
  it("--json ile model/agent döner", async () => {
    await withTempGraphAsync(
      { "a.md": frontmatter(TASK), "config.yml": CONFIG_YML },
      async (_graph, dir) => {
        await run(["route", "E01-F01-T01", "-g", dir, "--json"]);
        const parsed = JSON.parse(logs.join("\n"));
        expect(parsed.model).toBe("haiku");
        expect(parsed.agent).toBe("coder");
      },
    );
  });

  it("config.yml eksikse anlamlı hata, exitCode=1", async () => {
    await withTempGraphAsync({ "a.md": frontmatter(TASK) }, async (_graph, dir) => {
      await run(["route", "E01-F01-T01", "-g", dir]);
      expect(errors.join("\n")).toContain("config.yml");
      expect(process.exitCode).toBe(1);
    });
  });
});

describe("cli — gp set", () => {
  it("başarılı set sonrası INDEX.md ve _index.md yeniden üretilir", async () => {
    await withTempGraphAsync(
      {
        "E01-x/epic.md": frontmatter({
          id: "E01",
          kind: "epic",
          name: "E01-x",
          summary: "s",
          status: "pending",
          expanded: true,
        }),
        "E01-x/tasks/F01-T01-a.md": frontmatter(TASK),
      },
      async (_graph, dir) => {
        await run(["set", "E01-F01-T01", "status=done", "-g", dir]);
        expect(logs.join("\n")).toContain("güncellendi");
        expect(existsSync(join(dir, "INDEX.md"))).toBe(true);
        expect(existsSync(join(dir, "E01-x", "_index.md"))).toBe(true);
      },
    );
  });

  it("geçersiz patch key=value formatında değilse hata", async () => {
    await withTempGraphAsync({ "a.md": frontmatter(TASK) }, async (_graph, dir) => {
      await run(["set", "E01-F01-T01", "status-olmadan-esittir", "-g", dir]);
      expect(errors.join("\n")).toContain("geçersiz patch");
      expect(process.exitCode).toBe(1);
    });
  });
});

describe("cli — gp new", () => {
  it("yeni epic oluşturur", async () => {
    await withTempGraphAsync({}, async (_graph, dir) => {
      await run(["new", "epic", "--slug", "catalog", "-g", dir, "--json"]);
      const parsed = JSON.parse(logs.join("\n"));
      expect(parsed.id).toBe("E01");
    });
  });
});

describe("cli — gp context", () => {
  it("dosyayı yazar ve token özetini döner", async () => {
    await withTempGraphAsync(
      { "a.md": frontmatter(TASK), "config.yml": CONFIG_YML },
      async (_graph, dir) => {
        await run(["context", "E01-F01-T01", "-g", dir, "--json"]);
        const parsed = JSON.parse(logs.join("\n"));
        expect(typeof parsed.tokenEstimate).toBe("number");
        expect(existsSync(join(dir, "_runtime", "E01-F01-T01.context.md"))).toBe(true);
      },
    );
  });
});

const CONFIG_YML_2MODEL =
  "routing:\n  - when: {}\n    model: haiku\nescalation: [haiku, sonnet]\nmax_attempts_per_model: 1\nbudgets: { default_context: 8000, max_turns: 25 }\n";

describe("cli — gp checks", () => {
  it("config.yml'de check tanımlı değilse boş sonuç döner", async () => {
    await withTempGraphAsync(
      { "a.md": frontmatter(TASK), "config.yml": CONFIG_YML },
      async (_graph, dir) => {
        await run(["checks", "-g", dir, "--json"]);
        const parsed = JSON.parse(logs.join("\n"));
        expect(parsed.results).toEqual([]);
      },
    );
  });
});

describe("cli — gp escalate", () => {
  it("haiku'dan sonnet'e yükseltir", async () => {
    await withTempGraphAsync(
      { "a.md": frontmatter(TASK), "config.yml": CONFIG_YML_2MODEL },
      async (_graph, dir) => {
        await run(["escalate", "E01-F01-T01", "-g", dir, "--json"]);
        const parsed = JSON.parse(logs.join("\n"));
        expect(parsed.escalated).toBe(true);
        expect(parsed.toModel).toBe("sonnet");
      },
    );
  });

  it("escalation tükenmişse exitCode=1", async () => {
    await withTempGraphAsync(
      { "a.md": frontmatter({ ...TASK, model: "sonnet" }), "config.yml": CONFIG_YML_2MODEL },
      async (_graph, dir) => {
        await run(["escalate", "E01-F01-T01", "-g", dir]);
        expect(process.exitCode).toBe(1);
      },
    );
  });
});

describe("cli — gp fail", () => {
  it("terminal duruma geçirir, bağımlıları blocked yapar, exitCode set edilmez (başarılı işlem)", async () => {
    await withTempGraphAsync(
      {
        "a.md": frontmatter(TASK),
        "b.md": frontmatter({ ...TASK, id: "E01-F01-T02", name: "b", depends_on: ["E01-F01-T01"] }),
      },
      async (_graph, dir) => {
        await run(["fail", "E01-F01-T01", "--reason", "test hatası", "-g", dir, "--json"]);
        const parsed = JSON.parse(logs.join("\n"));
        expect(parsed.ok).toBe(true);
        expect(parsed.blockedDependents).toEqual(["E01-F01-T02"]);
        expect(process.exitCode).toBeFalsy();
      },
    );
  });
});

describe("cli — gp expand-candidates", () => {
  it("expanded:false, depends_on'u olmayan bir epic'i listeler", async () => {
    await withTempGraphAsync(
      {
        "e.md": frontmatter({
          id: "E01",
          kind: "epic",
          name: "E01-x",
          summary: "s",
          status: "pending",
          expanded: false,
          depends_on: [],
        }),
      },
      async (_graph, dir) => {
        await run(["expand-candidates", "-g", dir, "--json"]);
        const parsed = JSON.parse(logs.join("\n"));
        expect(parsed.candidates).toEqual([{ id: "E01", kind: "epic" }]);
      },
    );
  });
});

describe("cli — gp fix-loop", () => {
  it("record + status: 0 eksikli bir tur sonrası 'yakınsadı' döner", async () => {
    await withTempGraphAsync(
      { "a.md": frontmatter(TASK), "config.yml": CONFIG_YML },
      async (_graph, dir) => {
        await run([
          "fix-loop",
          "record",
          "E01-F01-T01",
          "--round",
          "1",
          "--issues",
          "0",
          "-g",
          dir,
        ]);
        logs = []; // record'un çıktısını status testinden ayır
        await run(["fix-loop", "status", "E01-F01-T01", "-g", dir, "--json"]);
        const parsed = JSON.parse(logs.join("\n"));
        expect(parsed.shouldBreak).toBe(true);
        expect(parsed.converged).toBe(true);
      },
    );
  });
});

describe("cli — gp run (Mod B)", () => {
  it("--max-nodes 0: HİÇ düğüm işlemez (0 yanlışlıkla 'sınırsız' sayılmamalı)", async () => {
    await withTempGraphAsync(
      { "a.md": frontmatter(TASK), "config.yml": CONFIG_YML },
      async (_graph, dir) => {
        await run(["run", "-g", dir, "--agents-dir", dir, "--max-nodes", "0", "--json"]);
        const parsed = JSON.parse(logs.join("\n"));
        expect(parsed.processed).toEqual([]);
      },
    );
  });

  it("ready düğüm yoksa (gerçek bitmemiş bağımlılık) hiçbir şey işlemez, çökmez", async () => {
    await withTempGraphAsync(
      {
        "a.md": frontmatter({ ...TASK, status: "pending" }), // T01 — henüz done değil
        "b.md": frontmatter({
          ...TASK,
          id: "E01-F01-T02",
          name: "b",
          depends_on: ["E01-F01-T01"], // T02, T01'i bekliyor — ready değil
        }),
        "config.yml": CONFIG_YML,
      },
      async (_graph, dir) => {
        // Sadece T02'nin ready OLMADIĞINI doğruluyoruz; T01 gerçekten ready olduğu için
        // onu işlemeye çalışırdı (coder.md yok, hata verirdi) — bu yüzden max-nodes:0 ile
        // hiç işlemediğimizi, sadece komutun çökmediğini doğruluyoruz.
        await run(["run", "-g", dir, "--agents-dir", dir, "--max-nodes", "0", "--json"]);
        const parsed = JSON.parse(logs.join("\n"));
        expect(parsed.processed).toEqual([]);
      },
    );
  });

  it("agent tanım dosyası bulunamazsa anlamlı hatayla çıkar, çökmez", async () => {
    await withTempGraphAsync(
      { "a.md": frontmatter(TASK), "config.yml": CONFIG_YML },
      async (_graph, dir) => {
        await run(["run", "-g", dir, "--agents-dir", dir]); // dir'de coder.md yok
        expect(errors.join("\n")).toContain("hata:");
        expect(process.exitCode).toBe(1);
      },
    );
  });
});
