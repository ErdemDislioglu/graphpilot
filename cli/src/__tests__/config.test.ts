import { describe, expect, it } from "vitest";
import { ConfigSchema } from "../schema/index.js";

const MINIMAL = {
  routing: [{ when: {}, model: "haiku" }],
  escalation: ["haiku", "sonnet"],
  max_attempts_per_model: 1,
  budgets: { default_context: 8000, max_turns: 25 },
};

describe("ConfigSchema — checks/fix_loop varsayılanları (Faz 6 eklemesi)", () => {
  it("checks/fix_loop hiç verilmezse roadmap'in belgelenen varsayılanlarıyla dolar", () => {
    const result = ConfigSchema.parse(MINIMAL);
    expect(result.checks).toEqual({});
    expect(result.fix_loop).toEqual({
      enabled: true,
      max_rounds: 3,
      acceptance_check_model: "haiku",
      break_if_no_progress: true,
    });
  });

  it("checks kısmen verilirse (sadece test) diğerleri undefined kalır", () => {
    const result = ConfigSchema.parse({ ...MINIMAL, checks: { test: "npm test" } });
    expect(result.checks).toEqual({ test: "npm test" });
  });

  it("fix_loop kısmen override edilirse diğer alanlar varsayılanda kalır", () => {
    const result = ConfigSchema.parse({ ...MINIMAL, fix_loop: { max_rounds: 5 } });
    expect(result.fix_loop.max_rounds).toBe(5);
    expect(result.fix_loop.enabled).toBe(true);
  });
});

describe("ConfigSchema — optimizations/scaffold_commands (Faz 7 eklemesi)", () => {
  it("optimizations hiç verilmezse tüm teknikler varsayılan açık", () => {
    const result = ConfigSchema.parse(MINIMAL);
    expect(result.optimizations).toEqual({
      cache_friendly_order: true,
      log_trimming: true,
      tool_restriction: true,
      batch_low_nodes: true,
      deterministic_scaffold: true,
      turn_limits: true,
      repo_map: true,
    });
  });

  it("optimizations kısmen kapatılırsa sadece belirtilen teknik kapanır", () => {
    const result = ConfigSchema.parse({
      ...MINIMAL,
      optimizations: { cache_friendly_order: false },
    });
    expect(result.optimizations.cache_friendly_order).toBe(false);
    expect(result.optimizations.log_trimming).toBe(true);
  });

  it("optimizations'ta bilinmeyen anahtar reddedilir (strict — tipo yakalanır)", () => {
    const result = ConfigSchema.safeParse({
      ...MINIMAL,
      optimizations: { cache_friendly_oder: false },
    });
    expect(result.success).toBe(false);
  });

  it("scaffold_commands hiç verilmezse boş obje", () => {
    expect(ConfigSchema.parse(MINIMAL).scaffold_commands).toEqual({});
  });

  it("scaffold_commands verilirse aynen korunur", () => {
    const result = ConfigSchema.parse({
      ...MINIMAL,
      scaffold_commands: { "vite-react": "npm create vite@latest . -- --template react-ts" },
    });
    expect(result.scaffold_commands["vite-react"]).toBe(
      "npm create vite@latest . -- --template react-ts",
    );
  });
});

describe("ConfigSchema — mode_b.rate_limit_retry (Faz 9.2 eklemesi)", () => {
  it("hiç verilmezse varsayılan: açık, 60s, 3 retry", () => {
    expect(ConfigSchema.parse(MINIMAL).mode_b).toEqual({
      rate_limit_retry: { enabled: true, wait_seconds: 60, max_retries: 3 },
    });
  });

  it("kısmen override edilirse diğer alanlar varsayılanda kalır", () => {
    const result = ConfigSchema.parse({
      ...MINIMAL,
      mode_b: { rate_limit_retry: { wait_seconds: 120 } },
    });
    expect(result.mode_b.rate_limit_retry).toEqual({
      enabled: true,
      wait_seconds: 120,
      max_retries: 3,
    });
  });
});
