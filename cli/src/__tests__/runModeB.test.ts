import { describe, expect, it } from "vitest";
import {
  buildHeadlessArgs,
  isRateLimitSignal,
  lastAgentMessage,
  parseAgentReturn,
  runNodeHeadless,
  runNodeHeadlessWithRetry,
} from "../runModeB.js";

const AGENT_DEF = { tools: "Read,Edit,Write,Bash", systemPrompt: "Sen koderısın." };
const ROUTE = { model: "sonnet", max_turns: 25 };

describe("buildHeadlessArgs", () => {
  it("--bare İÇERMEZ (ADR-001 — abonelik korunur)", () => {
    const args = buildHeadlessArgs("context içeriği", AGENT_DEF, ROUTE);
    expect(args).not.toContain("--bare");
  });

  it("model, max-turns, append-system-prompt ve allowedTools'u doğru geçirir", () => {
    const args = buildHeadlessArgs("context içeriği", AGENT_DEF, ROUTE);
    expect(args).toContain("--model");
    expect(args).toContain("sonnet");
    expect(args).toContain("--max-turns");
    expect(args).toContain("25");
    expect(args).toContain("--append-system-prompt");
    expect(args).toContain("Sen koderısın.");
    expect(args).toContain("--allowedTools");
    expect(args).toContain("Read,Edit,Write,Bash");
    expect(args).toContain("-p");
    expect(args).toContain("context içeriği");
  });

  it("Faz 15: araçları kısıtlar, MCP ve skill listesini kapatır", () => {
    const args = buildHeadlessArgs("ctx", { tools: "Read, Glob, Bash", systemPrompt: "x" }, ROUTE);
    expect(args[args.indexOf("--tools") + 1]).toBe("Read,Glob,Bash");
    expect(args).toContain("--strict-mcp-config");
    expect(args).toContain("--disable-slash-commands");
    expect(args).not.toContain("--mcp-config");
  });
});

describe("runNodeHeadless — agent 'blocked:' dönüşü (Faz 12)", () => {
  const json = (result: string) => JSON.stringify({ type: "result", result });

  it("json çıktıda result'ın son satırı 'blocked: X' → ok:false, blocked:true, reason", () => {
    const r = runNodeHeadless("ctx", AGENT_DEF, ROUTE, () => ({ stdout: json("Denedim.\nblocked: API anahtarı yok"), status: 0 }));
    expect(r).toMatchObject({ ok: false, blocked: true, blockedReason: "API anahtarı yok" });
    expect(r.question).toBeUndefined();
  });

  it("json olmayan düz stdout'ta da 'blocked:' yakalanır", () => {
    const r = runNodeHeadless("ctx", AGENT_DEF, ROUTE, () => ({ stdout: "blocked: brief çelişkili\n", status: 0 }));
    expect(r).toMatchObject({ ok: false, blocked: true, blockedReason: "brief çelişkili" });
  });

  it("normal 'done' çıktısı → ok:true, blocked yok", () => {
    const r = runNodeHeadless("ctx", AGENT_DEF, ROUTE, () => ({ stdout: json("done\nbulgu: x"), status: 0 }));
    expect(r.ok).toBe(true);
    expect(r.blocked).toBeUndefined();
  });

  it("satır ortasındaki 'blocked:' sayılmaz", () => {
    const r = runNodeHeadless("ctx", AGENT_DEF, ROUTE, () => ({ stdout: json("done — hiçbir şey blocked: değil"), status: 0 }));
    expect(r.ok).toBe(true);
  });

  it("soru + en az iki seçenek → question döner (mimari karar)", () => {
    const out = json("blocked: veri modeli kararı\nsoru: Hangi veritabanı?\nseçenek: PostgreSQL\nseçenek: SQLite");
    const r = runNodeHeadless("ctx", AGENT_DEF, ROUTE, () => ({ stdout: out, status: 0 }));
    expect(r.question).toEqual({ text: "Hangi veritabanı?", options: ["PostgreSQL", "SQLite"] });
  });

  it("tek seçenekli soru yok sayılır (buton anlamsız) — yalnız blocked", () => {
    expect(parseAgentReturn("blocked: x\nsoru: y?\nseçenek: a")).toEqual({ blockedReason: "x" });
  });

  it("lastAgentMessage: json result alanı, değilse ham stdout", () => {
    expect(lastAgentMessage(json("merhaba"))).toBe("merhaba");
    expect(lastAgentMessage("{}")).toBe("{}");
    expect(lastAgentMessage("düz")).toBe("düz");
  });

  it("runNodeHeadlessWithRetry: gerekçe 'rate limit' içerse bile blocked retry edilmez", () => {
    let calls = 0;
    const r = runNodeHeadlessWithRetry("ctx", AGENT_DEF, ROUTE, { enabled: true, waitSeconds: 0, maxRetries: 3 }, () => {
      calls += 1;
      return { stdout: json("blocked: rate limit politikası belirsiz"), status: 0 };
    }, () => {});
    expect(calls).toBe(1);
    expect(r).toMatchObject({ blocked: true, rateLimited: false, attempts: 1 });
  });
});

describe("runNodeHeadless — mock spawner", () => {
  it("status:0 ise ok:true döner", () => {
    const result = runNodeHeadless("ctx", AGENT_DEF, ROUTE, () => ({ stdout: "{}", status: 0 }));
    expect(result.ok).toBe(true);
  });

  it("status != 0 ise ok:false döner", () => {
    const result = runNodeHeadless("ctx", AGENT_DEF, ROUTE, () => ({ stdout: "hata", status: 1 }));
    expect(result.ok).toBe(false);
  });

  it("spawner'a doğru argümanları geçirir", () => {
    let captured: string[] = [];
    runNodeHeadless("ctx", AGENT_DEF, ROUTE, (args) => {
      captured = args;
      return { stdout: "{}", status: 0 };
    });
    expect(captured).toEqual(buildHeadlessArgs("ctx", AGENT_DEF, ROUTE));
  });
});

describe("isRateLimitSignal — Faz 9.2/12.1 (gerçek hata metinleri, errors.md'den doğrulandı)", () => {
  it.each([
    "Error: rate limit exceeded",
    "RATE_LIMIT reached, try again later",
    "429 Too Many Requests",
    "usage limit reached for this period",
    "monthly quota exceeded",
    "You've hit your session limit",
    "You've hit your weekly limit",
    "You've hit your Opus limit",
    "You've hit your monthly spend limit",
    "Server is temporarily limiting requests",
  ])("'%s' içinde rate-limit sinyali bulur", (text) => {
    expect(isRateLimitSignal(text)).toBe(true);
  });

  it.each(["SyntaxError: unexpected token", "ENOENT: no such file", ""])(
    "'%s' rate-limit sinyali DEĞİL",
    (text) => {
      expect(isRateLimitSignal(text)).toBe(false);
    },
  );
});

describe("runNodeHeadlessWithRetry — mock spawner + mock sleep", () => {
  const RETRY_OPTS = { enabled: true, waitSeconds: 1, maxRetries: 3 };

  it("ilk denemede başarılıysa hiç retry yapmaz", () => {
    let calls = 0;
    const result = runNodeHeadlessWithRetry(
      "ctx",
      AGENT_DEF,
      ROUTE,
      RETRY_OPTS,
      () => {
        calls += 1;
        return { stdout: "{}", status: 0 };
      },
      () => {
        throw new Error("sleep çağrılmamalıydı");
      },
    );
    expect(result).toMatchObject({ ok: true, attempts: 1, rateLimited: false });
    expect(calls).toBe(1);
  });

  it("rate limit sinyaliyle başarısız olursa bekler ve tekrar dener, sonunda başarır", () => {
    let calls = 0;
    const sleeps: number[] = [];
    const result = runNodeHeadlessWithRetry(
      "ctx",
      AGENT_DEF,
      ROUTE,
      RETRY_OPTS,
      () => {
        calls += 1;
        if (calls < 3) return { stdout: "", stderr: "429 rate limit", status: 1 };
        return { stdout: "{}", status: 0 };
      },
      (s) => sleeps.push(s),
    );
    expect(result).toMatchObject({ ok: true, attempts: 3, rateLimited: false });
    expect(sleeps).toEqual([1, 1]);
  });

  it("maxRetries tükenirse rateLimited:true ile durur, failed SAYMAZ", () => {
    const result = runNodeHeadlessWithRetry(
      "ctx",
      AGENT_DEF,
      ROUTE,
      { enabled: true, waitSeconds: 0, maxRetries: 2 },
      () => ({ stdout: "usage limit reached", status: 1 }),
      () => {},
    );
    expect(result.ok).toBe(false);
    expect(result.rateLimited).toBe(true);
    expect(result.attempts).toBe(3); // ilk deneme + 2 retry
  });

  it("rate-limit OLMAYAN bir hatada hiç retry yapmaz", () => {
    let calls = 0;
    const result = runNodeHeadlessWithRetry(
      "ctx",
      AGENT_DEF,
      ROUTE,
      RETRY_OPTS,
      () => {
        calls += 1;
        return { stdout: "", stderr: "SyntaxError: beklenmedik token", status: 1 };
      },
      () => {
        throw new Error("sleep çağrılmamalıydı — bu rate-limit değil");
      },
    );
    expect(result).toMatchObject({ ok: false, rateLimited: false, attempts: 1 });
    expect(calls).toBe(1);
  });

  it("enabled:false ise rate limit sinyali olsa da retry yapmaz", () => {
    const result = runNodeHeadlessWithRetry(
      "ctx",
      AGENT_DEF,
      ROUTE,
      { enabled: false, waitSeconds: 1, maxRetries: 3 },
      () => ({ stdout: "429 Too Many Requests", status: 1 }),
      () => {
        throw new Error("sleep çağrılmamalıydı — enabled:false");
      },
    );
    expect(result).toMatchObject({ ok: false, rateLimited: true, attempts: 1 });
  });
});
