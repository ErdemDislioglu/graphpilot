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

describe("ConfigSchema — autopilot (Faz 12.2 eklemesi)", () => {
  it("hiç verilmezse roadmap 12.2'nin belgelenen varsayılanlarıyla dolar", () => {
    const result = ConfigSchema.parse(MINIMAL);
    expect(result.autopilot).toEqual({
      enabled: false,
      scope: "all",
      notify: {
        channel: "telegram",
        on: ["epic_done", "phase_done", "failure", "limit", "finished"],
        verbosity: "short",
      },
      approvals: { on_failure: "ask", timeout_minutes: 120, timeout_action: "stop", on_risk_high: false },
      limits: { wait_for_reset: true, max_wait_hours: 12 },
      language: "tr",
      idle_wait: false,
      git: { commit: false, branch_per_epic: false, push_on_epic_done: false },
    });
  });

  it("scope 'epic:E03' ve 'until:E05' biçimlerini kabul eder", () => {
    expect(ConfigSchema.parse({ ...MINIMAL, autopilot: { scope: "epic:E03" } }).autopilot.scope).toBe(
      "epic:E03",
    );
    expect(ConfigSchema.parse({ ...MINIMAL, autopilot: { scope: "until:E05" } }).autopilot.scope).toBe(
      "until:E05",
    );
  });

  it("scope geçersiz biçimde verilirse reddedilir", () => {
    const result = ConfigSchema.safeParse({ ...MINIMAL, autopilot: { scope: "epic-E03" } });
    expect(result.success).toBe(false);
  });

  it("quiet_hours 'SS:DD-SS:DD' biçimini kabul eder, geçersizi reddeder", () => {
    expect(
      ConfigSchema.parse({ ...MINIMAL, autopilot: { quiet_hours: "00:00-08:00" } }).autopilot.quiet_hours,
    ).toBe("00:00-08:00");
    const result = ConfigSchema.safeParse({ ...MINIMAL, autopilot: { quiet_hours: "geceyarısı" } });
    expect(result.success).toBe(false);
  });

  it("notify kısmen override edilirse diğer alanlar varsayılanda kalır", () => {
    const result = ConfigSchema.parse({ ...MINIMAL, autopilot: { notify: { verbosity: "detailed" } } });
    expect(result.autopilot.notify.verbosity).toBe("detailed");
    expect(result.autopilot.notify.channel).toBe("telegram");
  });

  it("autopilot içinde bilinmeyen anahtar reddedilir (strict — tipo yakalanır)", () => {
    const result = ConfigSchema.safeParse({ ...MINIMAL, autopilot: { enabledx: true } });
    expect(result.success).toBe(false);
  });

  it("language 'en' seçilebilir", () => {
    expect(ConfigSchema.parse({ ...MINIMAL, autopilot: { language: "en" } }).autopilot.language).toBe("en");
  });
});

describe("ConfigSchema — team (Faz 13.2 eklemesi)", () => {
  it("hiç verilmezse roadmap 13.2'nin belgelenen varsayılanlarıyla dolar (2026-10-25: enabled varsayılan TRUE — ekip modu bu plugin'in varsayılan çalışma şekli)", () => {
    const result = ConfigSchema.parse(MINIMAL);
    expect(result.team).toEqual({
      enabled: true,
      manager: {
        model: "sonnet",
        consult_senior_for: ["architecture", "data_model", "security"],
        autonomy: "balanced",
      },
      junior: { low: "haiku", med: "sonnet", max_parallel: 2 },
      senior: { model: "opus", max_parallel: 1 },
      tester: { model: "haiku", upgrade_to: "sonnet" },
      reviewer: { enabled: true, triage: "haiku", deep: "sonnet" },
      docs: { model: "haiku" },
    });
  });

  it("team.enabled:true + manager.autonomy override edilebilir, diğerleri varsayılanda kalır", () => {
    const result = ConfigSchema.parse({
      ...MINIMAL,
      team: { enabled: true, manager: { autonomy: "bold" } },
    });
    expect(result.team.enabled).toBe(true);
    expect(result.team.manager.autonomy).toBe("bold");
    expect(result.team.manager.model).toBe("sonnet");
  });

  it("junior.budget_pct 0-100 aralığında olmalı", () => {
    expect(
      ConfigSchema.parse({ ...MINIMAL, team: { junior: { budget_pct: 30 } } }).team.junior
        .budget_pct,
    ).toBe(30);
    const result = ConfigSchema.safeParse({ ...MINIMAL, team: { junior: { budget_pct: 150 } } });
    expect(result.success).toBe(false);
  });

  it("team içinde bilinmeyen anahtar reddedilir (strict)", () => {
    const result = ConfigSchema.safeParse({ ...MINIMAL, team: { enabledx: true } });
    expect(result.success).toBe(false);
  });

  it("manager.autonomy sadece cautious|balanced|bold kabul eder", () => {
    const result = ConfigSchema.safeParse({ ...MINIMAL, team: { manager: { autonomy: "aggressive" } } });
    expect(result.success).toBe(false);
  });
});

describe("ConfigSchema — Faz 14 efficiency (ölçek koruması)", () => {
  const BASE = {
    routing: [{ when: {}, model: "haiku" }],
    escalation: ["haiku"],
    max_attempts_per_model: 1,
    budgets: { default_context: 8000, max_turns: 25 },
  };

  it("varsayılanlar: tasarruflar açık, eşikler belgedeki değerler", () => {
    expect(ConfigSchema.parse(BASE).efficiency).toEqual({
      small_epic_max_features: 3,
      small_epic_max_tasks: 8,
      merge_interface_task: true,
      separate_test_min_risk: "med",
      expansion_model: "sonnet",
      feature_agent: true,
      feature_agent_max_tasks: 4,
      doc_budget: { task_body: 350, feature_body: 150, epic_body: 150 },
      small_project_warn_tasks: 6,
    });
  });

  it("her tasarruf tek ayarla eski davranışa döner; bilinmeyen anahtar reddedilir", () => {
    const off = ConfigSchema.parse({
      ...BASE,
      efficiency: {
        small_epic_max_features: 0,
        merge_interface_task: false,
        separate_test_min_risk: "low",
        expansion_model: "opus",
        feature_agent: false,
        small_project_warn_tasks: 0,
      },
    }).efficiency;
    expect(off).toMatchObject({
      small_epic_max_features: 0,
      merge_interface_task: false,
      separate_test_min_risk: "low",
      expansion_model: "opus",
      feature_agent: false,
      small_project_warn_tasks: 0,
    });
    expect(ConfigSchema.safeParse({ ...BASE, efficiency: { yok: 1 } }).success).toBe(false);
  });
});
