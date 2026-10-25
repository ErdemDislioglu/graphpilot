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

  it("2026-10-25: team.enabled varsayılan TRUE — complexity:high bir görev routing tablosundan BAĞIMSIZ senior'a gider", async () => {
    await withTempGraphAsync(
      { "a.md": frontmatter({ ...TASK, complexity: "high" }), "config.yml": CONFIG_YML },
      async (_graph, dir) => {
        await run(["route", "E01-F01-T01", "-g", dir, "--json"]);
        const parsed = JSON.parse(logs.join("\n"));
        // CONFIG_YML'in routing tablosu ("when:{} → haiku") bunu ASLA senior'a göndermez
        // — bu, ekip modunun GERÇEKTEN devrede olduğunu kanıtlıyor (routing tablosu
        // bypass edildi).
        expect(parsed).toEqual({ model: "opus", agent: "senior", review: false, budget: 8000, max_turns: 25 });
      },
    );
  });

  it("team.enabled:false ile eski config.routing tablosu kullanılır (geriye dönük uyum)", async () => {
    await withTempGraphAsync(
      {
        "a.md": frontmatter({ ...TASK, complexity: "high" }),
        "config.yml": CONFIG_YML + "team: { enabled: false }\n",
      },
      async (_graph, dir) => {
        await run(["route", "E01-F01-T01", "-g", dir, "--json"]);
        const parsed = JSON.parse(logs.join("\n"));
        // routing tablosu complexity'ye bakmadan hep haiku diyor — team kapalıyken bu
        // geçerli kalmalı (complexity:high bile olsa senior'a GİTMEMELİ).
        expect(parsed.model).toBe("haiku");
        expect(parsed.agent).toBe("coder");
      },
    );
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

  it("Faz 14 B2: son task done olunca feature ve epic de done olur, gp status'ta pending kalmaz", async () => {
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
        "E01-x/F01-a.md": frontmatter({
          id: "E01-F01",
          kind: "feature",
          name: "F01-a",
          summary: "s",
          status: "pending",
          expanded: true,
        }),
        "E01-x/tasks/F01-T01-a.md": frontmatter(TASK),
      },
      async (_graph, dir) => {
        await run(["set", "E01-F01-T01", "status=done", "-g", dir, "--json"]);
        expect(JSON.parse(logs.join("\n")).rollup).toEqual([
          { id: "E01", from: "pending", to: "done" },
          { id: "E01-F01", from: "pending", to: "done" },
        ]);
        logs = [];
        await run(["status", "-g", dir, "--json"]);
        const status = JSON.parse(logs.join("\n"));
        expect(status.byStatus).toEqual({ done: 3 });
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

describe("cli — gp check (Faz 14 B1)", () => {
  it("git deposu dışında --json ile success:false basar ve exitCode=1 olur", async () => {
    await withTempGraphAsync(
      { "a.md": `${frontmatter(TASK)}\n## Kabul kriterleri\n- A çalışır\n`, "config.yml": CONFIG_YML },
      async (_graph, dir) => {
        await run(["check", "E01-F01-T01", "-g", dir, "-p", dir, "--json"]);
        const parsed = JSON.parse(logs.join("\n"));
        expect(parsed.success).toBe(false);
        expect(parsed.results).toEqual([]);
        expect(parsed.error).toContain("git deposu değil");
        expect(process.exitCode).toBe(1);
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
    // team.enabled AÇIKÇA false — bu test `config.routing`'in (Faz 6.5) escalation
    // listesi TÜKENDİĞİNDE davranışını hedefliyor. Ekip modunun kendi zinciri (junior→
    // junior(üst model)→senior) FARKLI/daha uzun bir merdiven, "sonnet" onda tükenmiş
    // SAYILMAZ (senior/opus hâlâ var) — team.enabled varsayılan açık olduğu için bu
    // testin niyetini korumak için açıkça kapatılıyor.
    await withTempGraphAsync(
      {
        "a.md": frontmatter({ ...TASK, model: "sonnet" }),
        "config.yml": CONFIG_YML_2MODEL + "team: { enabled: false }\n",
      },
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

describe("cli — gp autopilot (Faz 12.10)", () => {
  it("status: kilit dosyası yoksa 'çalışmıyor' döner", async () => {
    await withTempGraphAsync({ "a.md": frontmatter(TASK), "config.yml": CONFIG_YML }, async (_graph, dir) => {
      await run(["autopilot", "status", "-g", dir, "--json"]);
      const parsed = JSON.parse(logs.join("\n"));
      expect(parsed.running).toBe(false);
    });
  });

  it("stop: kilit dosyası yoksa hatasız 'çalışmıyor' döner (exitCode set edilmez)", async () => {
    await withTempGraphAsync({ "a.md": frontmatter(TASK), "config.yml": CONFIG_YML }, async (_graph, dir) => {
      await run(["autopilot", "stop", "-g", dir, "--json"]);
      const parsed = JSON.parse(logs.join("\n"));
      expect(parsed.stopped).toBe(false);
      expect(process.exitCode).toBeFalsy();
    });
  });

  it("logs: hiç log yoksa anlamlı mesaj döner, çökmez", async () => {
    await withTempGraphAsync({ "a.md": frontmatter(TASK), "config.yml": CONFIG_YML }, async (_graph, dir) => {
      await run(["autopilot", "logs", "-g", dir, "--json"]);
      const parsed = JSON.parse(logs.join("\n"));
      expect(parsed.lines).toEqual([]);
    });
  });

  it("start: autopilot.enabled false ise başlatmaz, anlamlı hata verir", async () => {
    await withTempGraphAsync(
      { "a.md": frontmatter(TASK), "config.yml": CONFIG_YML },
      async (_graph, dir) => {
        await run(["autopilot", "start", "-g", dir, "--agents-dir", dir]);
        expect(errors.join("\n")).toContain("autopilot.enabled");
        expect(process.exitCode).toBe(1);
      },
    );
  });

  it("start: zaten çalışan bir kilit varsa ikinci başlatmayı reddeder", async () => {
    await withTempGraphAsync(
      {
        "a.md": frontmatter(TASK),
        "config.yml": CONFIG_YML + "autopilot: { enabled: true }\n",
      },
      async (_graph, dir) => {
        const { writeLock } = await import("../autopilot/processLock.js");
        writeLock(dir, process.pid); // kendi PID'imiz — her zaman "canlı"
        await run(["autopilot", "start", "-g", dir, "--agents-dir", dir]);
        expect(errors.join("\n")).toContain("zaten çalışıyor");
        expect(process.exitCode).toBe(1);
      },
    );
  });

  // "secrets yoksa hata ver" dalı KASITLI OLARAK burada test edilmiyor: `loadSecrets()`
  // gerçek `~/.graphpilot/secrets.json`'u okur (cli.ts'te ev dizini enjekte edilebilir
  // değil) — bu makinede o dosya zaten varsa test sahte bir şekilde başarısız/başarılı
  // olurdu. Mantığın kendisi (`loadSecrets` null döner) `secrets.test.ts`'te enjekte
  // edilmiş bir ev diziniyle hermetic olarak zaten test edildi.
});

describe("cli — gp team (Faz 13)", () => {
  const TEAM_TASK = { ...TASK, complexity: "high" };

  it("assign: complexity:high → senior", async () => {
    await withTempGraphAsync(
      { "a.md": frontmatter(TEAM_TASK), "config.yml": CONFIG_YML + "team: { enabled: true }\n" },
      async (_graph, dir) => {
        await run(["team", "assign", "E01-F01-T01", "-g", dir, "--json"]);
        const parsed = JSON.parse(logs.join("\n"));
        expect(parsed).toEqual({ role: "senior", model: "opus", agent: "senior" });
      },
    );
  });

  it("escalate: junior(haiku) → junior(sonnet)", async () => {
    await withTempGraphAsync(
      {
        "a.md": frontmatter({ ...TASK, complexity: "low", model: "haiku" }),
        "config.yml": CONFIG_YML + "team: { enabled: true }\n",
      },
      async (_graph, dir) => {
        await run(["team", "escalate", "E01-F01-T01", "-g", dir, "--json"]);
        const parsed = JSON.parse(logs.join("\n"));
        expect(parsed.escalated).toBe(true);
        expect(parsed.toRole).toBe("junior");
        expect(parsed.toModel).toBe("sonnet");
      },
    );
  });

  it("decisions list: hiç karar yoksa boş dizi/anlamlı mesaj", async () => {
    await withTempGraphAsync({ "a.md": frontmatter(TASK), "config.yml": CONFIG_YML }, async (_graph, dir) => {
      await run(["team", "decisions", "list", "-g", dir, "--json"]);
      const parsed = JSON.parse(logs.join("\n"));
      expect(parsed).toEqual([]);
    });
  });

  it("decisions override: var olmayan id için anlamlı hata, exitCode=1", async () => {
    await withTempGraphAsync({ "a.md": frontmatter(TASK), "config.yml": CONFIG_YML }, async (_graph, dir) => {
      await run(["team", "decisions", "override", "YOK-D1", "-g", dir]);
      expect(errors.join("\n")).toContain("karar bulunamadı");
      expect(process.exitCode).toBe(1);
    });
  });

  it("stats: boş projede sıfırlarla döner, çökmez", async () => {
    await withTempGraphAsync({ "a.md": frontmatter(TASK), "config.yml": CONFIG_YML }, async (_graph, dir) => {
      await run(["team", "stats", "-g", dir, "--json"]);
      const parsed = JSON.parse(logs.join("\n"));
      expect(parsed.doneTasks).toBe(0);
      expect(parsed.misTagRatio).toBe(0);
      expect(parsed.decisionsTotal).toBe(0);
    });
  });
});

describe("cli — gp team finding / finding-answer (Faz 13.7/13.9)", () => {
  const SECURITY_FINDING_JSON = JSON.stringify({
    kind: "security",
    severity: "blocking",
    summary: "Şifre sıfırlama token'ı süresiz",
    options: ["15 dk sınır", "Olduğu gibi bırak", "Ayrı görev aç"],
    recommended: 0,
  });

  const NON_BLOCKING_FINDING_JSON = JSON.stringify({
    kind: "tech_debt",
    severity: "non_blocking",
    summary: "Tekrarlanan bir yardımcı fonksiyon var",
    options: ["Şimdilik bırak", "Ayrı görev aç"],
    recommended: 0,
  });

  it("non_blocking bulgu: hemen sonuçlanır, düğüme dokunmaz", async () => {
    await withTempGraphAsync(
      { "E01-x/epic.md": epicFrontmatterForTeam(), "E01-x/tasks/F01-T01-a.md": frontmatter(TASK), "config.yml": CONFIG_YML },
      async (_graph, dir) => {
        await run(["team", "finding", "E01-F01-T01", "--finding", NON_BLOCKING_FINDING_JSON, "-g", dir, "--json"]);
        const parsed = JSON.parse(logs.join("\n"));
        expect(parsed.outcome).toBe("proceeded_with_recommended");
      },
    );
  });

  it("bloklayan security bulgusu: needs_user_decision döner, düğümü needs_decision yapar", async () => {
    await withTempGraphAsync(
      { "E01-x/epic.md": epicFrontmatterForTeam(), "E01-x/tasks/F01-T01-a.md": frontmatter(TASK), "config.yml": CONFIG_YML },
      async (_graph, dir) => {
        await run(["team", "finding", "E01-F01-T01", "--finding", SECURITY_FINDING_JSON, "-g", dir, "--json"]);
        const parsed = JSON.parse(logs.join("\n"));
        expect(parsed.outcome).toBe("needs_user_decision");
        expect(parsed.options).toHaveLength(3);
      },
    );
  });

  it("finding-answer: seçenek uygulanınca pending'e döner, karar kaydedilir", async () => {
    await withTempGraphAsync(
      { "E01-x/epic.md": epicFrontmatterForTeam(), "E01-x/tasks/F01-T01-a.md": frontmatter(TASK), "config.yml": CONFIG_YML },
      async (_graph, dir) => {
        await run(["team", "finding", "E01-F01-T01", "--finding", SECURITY_FINDING_JSON, "-g", dir]);
        logs = [];
        await run([
          "team",
          "finding-answer",
          "E01-F01-T01",
          "--finding",
          SECURITY_FINDING_JSON,
          "--answer",
          "0",
          "-g",
          dir,
          "--json",
        ]);
        const parsed = JSON.parse(logs.join("\n"));
        expect(parsed).toEqual({ outcome: "user_chose", chosenOptionIndex: 0 });

        logs = [];
        await run(["team", "decisions", "list", "-g", dir, "--json"]);
        const decisions = JSON.parse(logs.join("\n"));
        expect(decisions).toHaveLength(1);
      },
    );
  });

  it("finding-answer: 'stop' durdurulur", async () => {
    await withTempGraphAsync(
      { "E01-x/epic.md": epicFrontmatterForTeam(), "E01-x/tasks/F01-T01-a.md": frontmatter(TASK), "config.yml": CONFIG_YML },
      async (_graph, dir) => {
        await run(["team", "finding", "E01-F01-T01", "--finding", SECURITY_FINDING_JSON, "-g", dir]);
        await run([
          "team",
          "finding-answer",
          "E01-F01-T01",
          "--finding",
          SECURITY_FINDING_JSON,
          "--answer",
          "stop",
          "-g",
          dir,
          "--json",
        ]);
        logs = [];
        await run(["status", "-g", dir, "--json"]);
        const status = JSON.parse(logs.join("\n"));
        expect(status.byStatus.failed).toBe(1);
      },
    );
  });
});

function epicFrontmatterForTeam(): string {
  const obj = { id: "E01", kind: "epic", name: "E01-x", summary: "s", status: "pending", expanded: true };
  const lines = Object.entries(obj).map(([k, v]) => `${k}: ${JSON.stringify(v)}`);
  return `---\n${lines.join("\n")}\n---\n## Epic\nx\n`;
}
