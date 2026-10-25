import { z } from "zod";
import { ComplexitySchema, ModelSchema, RiskSchema, TaskTypeSchema } from "./common.js";

/**
 * `config.yml` routing şeması — SPEC §10.
 * Üst seviye `.passthrough()`: Faz 6 (`fix_loop`), Faz 7 (`optimizations`), Faz 11 (üst
 * düzey `review`) kendi anahtarlarını ekleyecek; bu şema onları kırmamalı. Bilinen
 * anahtarların (`routing`, `escalation`, ...) iç yapısı `.strict()` kalır — tipo'lar
 * orada yakalanır.
 */

const RoutingConditionSchema = z
  .object({
    complexity: z.union([ComplexitySchema, z.array(ComplexitySchema)]).optional(),
    risk: z.union([RiskSchema, z.array(RiskSchema)]).optional(),
    type: z.union([TaskTypeSchema, z.array(TaskTypeSchema)]).optional(),
  })
  .strict();

const RoutingRuleSchema = z
  .object({
    when: RoutingConditionSchema,
    model: ModelSchema.exclude(["auto"]),
    // Faz 11'de review:true anlam kazanacak; şimdilik inert.
    review: z.boolean().default(false),
  })
  .strict();

const BudgetsSchema = z
  .object({
    default_context: z.number().int().positive(),
    max_turns: z.number().int().positive(),
  })
  .strict();

/**
 * Faz 6.3 eklemesi — Katman 1 (script) kontrolleri. Her alan opsiyonel (bazı projelerde
 * build/lint olmayabilir). `gp checks` bu komutları olduğu gibi çalıştırır, LLM yorumlamaz.
 */
const ChecksSchema = z
  .object({
    build: z.string().optional(),
    lint: z.string().optional(),
    test: z.string().optional(),
  })
  .strict();

/** Faz 6.3 eklemesi — doğrulama döngüsünün frenleri, roadmap'in kendi örneğiyle birebir. */
const FixLoopSchema = z
  .object({
    enabled: z.boolean().default(true),
    max_rounds: z.number().int().positive().default(3),
    acceptance_check_model: ModelSchema.exclude(["auto"]).default("haiku"),
    break_if_no_progress: z.boolean().default(true),
  })
  .strict();

/**
 * Faz 7 eklemesi — roadmap/faz-07 §başlık yaml'ı: her token-optimizasyon tekniği
 * ayrı açılıp kapatılabilir (Faz 8'de ablasyon için). Varsayılan hepsi açık —
 * "varsayılanlar akıllı, ayarlar açık" ilkesi (00-ROADMAP.md).
 */
const OptimizationsSchema = z
  .object({
    cache_friendly_order: z.boolean().default(true),
    log_trimming: z.boolean().default(true),
    tool_restriction: z.boolean().default(true),
    batch_low_nodes: z.boolean().default(true),
    deterministic_scaffold: z.boolean().default(true),
    turn_limits: z.boolean().default(true),
    repo_map: z.boolean().default(true),
  })
  .strict();

/** Roadmap 9.2 — Mod B'de rate limit/kullanım limiti görülünce bekleyip tekrar deneme. */
const RateLimitRetrySchema = z
  .object({
    enabled: z.boolean().default(true),
    wait_seconds: z.number().int().positive().default(60),
    max_retries: z.number().int().positive().default(3),
  })
  .strict();

const ModeBSchema = z
  .object({
    rate_limit_retry: RateLimitRetrySchema.default({
      enabled: true,
      wait_seconds: 60,
      max_retries: 3,
    }),
  })
  .strict();

/**
 * Faz 12.2 eklemesi — roadmap/faz-12-otopilot-ve-telegram.md §12.2'nin `config.yml`
 * örneğiyle birebir. Bot token/chat ID BURADA YOK (12.9: asla config.yml'de) —
 * `autopilot/secrets.ts` ayrı, repo dışı bir dosyada tutar.
 */
const AutopilotNotifyEventSchema = z.enum(["epic_done", "phase_done", "failure", "limit", "finished"]);

const AutopilotNotifySchema = z
  .object({
    channel: z.literal("telegram").default("telegram"),
    on: z.array(AutopilotNotifyEventSchema).default(["epic_done", "phase_done", "failure", "limit", "finished"]),
    verbosity: z.enum(["short", "detailed"]).default("short"),
  })
  .strict();

const AutopilotApprovalsSchema = z
  .object({
    on_failure: z.enum(["ask", "skip", "stop"]).default("ask"),
    timeout_minutes: z.number().int().positive().default(120),
    timeout_action: z.enum(["stop", "skip"]).default("stop"),
    // Roadmap 12.6 — "risk: high düğüm (config ile opsiyonel)". Anahtarın kendi adı
    // roadmap'te verilmemiş; varsayılan false — sessizce davranış değiştirmez.
    on_risk_high: z.boolean().default(false),
  })
  .strict();

const AutopilotLimitsSchema = z
  .object({
    wait_for_reset: z.boolean().default(true),
    max_wait_hours: z.number().int().positive().default(12),
  })
  .strict();

// "00:00-08:00" biçimi — roadmap örneğiyle birebir.
const QUIET_HOURS_RE = /^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$/;
// "all" | "epic:E03" | "until:E05" — roadmap örneğiyle birebir.
const AUTOPILOT_SCOPE_RE = /^(all|epic:[A-Za-z0-9_-]+|until:[A-Za-z0-9_-]+)$/;

const AutopilotSchema = z
  .object({
    enabled: z.boolean().default(false),
    scope: z.string().regex(AUTOPILOT_SCOPE_RE).default("all"),
    notify: AutopilotNotifySchema.default({
      channel: "telegram",
      on: ["epic_done", "phase_done", "failure", "limit", "finished"],
      verbosity: "short",
    }),
    approvals: AutopilotApprovalsSchema.default({
      on_failure: "ask",
      timeout_minutes: 120,
      timeout_action: "stop",
      on_risk_high: false,
    }),
    limits: AutopilotLimitsSchema.default({ wait_for_reset: true, max_wait_hours: 12 }),
    quiet_hours: z.string().regex(QUIET_HOURS_RE).optional(),
    // Roadmap'in kendisinde yok ama 12.5 "mesaj dili brief'teki proje diline göre (TR/EN)"
    // diyor — brief'ten otomatik tespit şu an tanımlı değil (SPEC.md'de yapılandırılmış bir
    // `language` alanı yok), bu yüzden burada açık bir alan olarak eklendi.
    language: z.enum(["tr", "en"]).default("tr"),
  })
  .strict();

/**
 * Faz 13.2 eklemesi — roadmap/faz-13-agent-ekibi-ve-yonetici.md §13.2'nin `config.yml`
 * örneğiyle birebir. `enabled:false` varsayılan — ekip modu AÇIKÇA açılmadan `config.routing`
 * (Faz 2/6'nın düz modu) geçerli kalır; `team/assign.ts` bu bayrağı kontrol eder.
 */
const TeamManagerSchema = z
  .object({
    model: ModelSchema.exclude(["auto"]).default("sonnet"),
    consult_senior_for: z.array(z.string()).default(["architecture", "data_model", "security"]),
    autonomy: z.enum(["cautious", "balanced", "bold"]).default("balanced"),
  })
  .strict();

const TeamJuniorSchema = z
  .object({
    low: ModelSchema.exclude(["auto"]).default("haiku"),
    med: ModelSchema.exclude(["auto"]).default("sonnet"),
    max_parallel: z.number().int().positive().default(2),
    // Faz 13.2 — "Rol başına token bütçesi (proje toplamının yüzdesi olarak opsiyonel üst sınır)".
    budget_pct: z.number().positive().max(100).optional(),
  })
  .strict();

const TeamSeniorSchema = z
  .object({
    model: ModelSchema.exclude(["auto"]).default("opus"),
    max_parallel: z.number().int().positive().default(1),
    budget_pct: z.number().positive().max(100).optional(),
  })
  .strict();

const TeamTesterSchema = z
  .object({
    model: ModelSchema.exclude(["auto"]).default("haiku"),
    upgrade_to: ModelSchema.exclude(["auto"]).default("sonnet"),
    budget_pct: z.number().positive().max(100).optional(),
  })
  .strict();

/** `enabled:true` ama Faz 11 (gerçek review mantığı) henüz yoksa roadmap'in kendi notu:
 * "reviewer rolü kapalı başlar" — bu INERT'liği `team/assign.ts` sağlar, şema değil. */
const TeamReviewerSchema = z
  .object({
    enabled: z.boolean().default(true),
    triage: ModelSchema.exclude(["auto"]).default("haiku"),
    deep: ModelSchema.exclude(["auto"]).default("sonnet"),
  })
  .strict();

const TeamDocsSchema = z
  .object({
    model: ModelSchema.exclude(["auto"]).default("haiku"),
    budget_pct: z.number().positive().max(100).optional(),
  })
  .strict();

const TeamSchema = z
  .object({
    // 2026-10-25, kullanıcı kararı: ekip modu bu plugin'in VARSAYILAN çalışma şekli —
    // `autopilot`'un aksine (gerçek bir Telegram bot token'ı gerektirir, opsiyonel
    // kalır), ekip modu dış bir bağımlılık istemiyor; kapatmak isteyen kullanıcı
    // `config.yml`'de `team: { enabled: false }` yazar.
    enabled: z.boolean().default(true),
    manager: TeamManagerSchema.default({
      model: "sonnet",
      consult_senior_for: ["architecture", "data_model", "security"],
      autonomy: "balanced",
    }),
    junior: TeamJuniorSchema.default({ low: "haiku", med: "sonnet", max_parallel: 2 }),
    senior: TeamSeniorSchema.default({ model: "opus", max_parallel: 1 }),
    tester: TeamTesterSchema.default({ model: "haiku", upgrade_to: "sonnet" }),
    reviewer: TeamReviewerSchema.default({ enabled: true, triage: "haiku", deep: "sonnet" }),
    docs: TeamDocsSchema.default({ model: "haiku" }),
  })
  .strict();

export const DEFAULT_OPTIMIZATIONS = {
  cache_friendly_order: true,
  log_trimming: true,
  tool_restriction: true,
  batch_low_nodes: true,
  deterministic_scaffold: true,
  turn_limits: true,
  repo_map: true,
} as const;

export const ConfigSchema = z
  .object({
    routing: z.array(RoutingRuleSchema).min(1),
    escalation: z.array(ModelSchema.exclude(["auto"])).min(1),
    max_attempts_per_model: z.number().int().positive(),
    budgets: BudgetsSchema,
    // Faz 5.6 eklemesi: true ise `/gp:expand` her genişletmeden önce kullanıcı onayı
    // ister. Varsayılan false — epic onayı (Faz 4) yeterli sayılır.
    confirm_expand: z.boolean().default(false),
    checks: ChecksSchema.default({}),
    fix_loop: FixLoopSchema.default({
      enabled: true,
      max_rounds: 3,
      acceptance_check_model: "haiku",
      break_if_no_progress: true,
    }),
    // Faz 6.8 eklemesi: /gp:run'ın aynı anda kaç çakışmasız düğümü paralel çalıştıracağı.
    parallelism: z.number().int().positive().default(2),
    optimizations: OptimizationsSchema.default(DEFAULT_OPTIMIZATIONS),
    // Faz 7.6 eklemesi: `type: scaffold` task'ları için resmi iskelet komutları.
    // Anahtar = task frontmatter'daki `scaffold_stack` (ör. "vite-react"), değer = çalıştırılacak komut.
    scaffold_commands: z.record(z.string(), z.string()).default({}),
    mode_b: ModeBSchema.default({
      rate_limit_retry: { enabled: true, wait_seconds: 60, max_retries: 3 },
    }),
    autopilot: AutopilotSchema.default({
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
    }),
    team: TeamSchema.default({
      enabled: true,
      manager: { model: "sonnet", consult_senior_for: ["architecture", "data_model", "security"], autonomy: "balanced" },
      junior: { low: "haiku", med: "sonnet", max_parallel: 2 },
      senior: { model: "opus", max_parallel: 1 },
      tester: { model: "haiku", upgrade_to: "sonnet" },
      reviewer: { enabled: true, triage: "haiku", deep: "sonnet" },
      docs: { model: "haiku" },
    }),
  })
  .passthrough();

export type Config = z.infer<typeof ConfigSchema>;
export type Optimizations = z.infer<typeof OptimizationsSchema>;
export type AutopilotConfig = z.infer<typeof AutopilotSchema>;
export type TeamConfig = z.infer<typeof TeamSchema>;
