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
  })
  .passthrough();

export type Config = z.infer<typeof ConfigSchema>;
export type Optimizations = z.infer<typeof OptimizationsSchema>;
