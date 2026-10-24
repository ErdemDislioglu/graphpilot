import { z } from "zod";
/**
 * Faz 7 eklemesi — roadmap/faz-07 §başlık yaml'ı: her token-optimizasyon tekniği
 * ayrı açılıp kapatılabilir (Faz 8'de ablasyon için). Varsayılan hepsi açık —
 * "varsayılanlar akıllı, ayarlar açık" ilkesi (00-ROADMAP.md).
 */
declare const OptimizationsSchema: z.ZodObject<{
    cache_friendly_order: z.ZodDefault<z.ZodBoolean>;
    log_trimming: z.ZodDefault<z.ZodBoolean>;
    tool_restriction: z.ZodDefault<z.ZodBoolean>;
    batch_low_nodes: z.ZodDefault<z.ZodBoolean>;
    deterministic_scaffold: z.ZodDefault<z.ZodBoolean>;
    turn_limits: z.ZodDefault<z.ZodBoolean>;
    repo_map: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strict>;
export declare const DEFAULT_OPTIMIZATIONS: {
    readonly cache_friendly_order: true;
    readonly log_trimming: true;
    readonly tool_restriction: true;
    readonly batch_low_nodes: true;
    readonly deterministic_scaffold: true;
    readonly turn_limits: true;
    readonly repo_map: true;
};
export declare const ConfigSchema: z.ZodObject<{
    routing: z.ZodArray<z.ZodObject<{
        when: z.ZodObject<{
            complexity: z.ZodOptional<z.ZodUnion<readonly [z.ZodEnum<{
                low: "low";
                med: "med";
                high: "high";
            }>, z.ZodArray<z.ZodEnum<{
                low: "low";
                med: "med";
                high: "high";
            }>>]>>;
            risk: z.ZodOptional<z.ZodUnion<readonly [z.ZodEnum<{
                low: "low";
                med: "med";
                high: "high";
            }>, z.ZodArray<z.ZodEnum<{
                low: "low";
                med: "med";
                high: "high";
            }>>]>>;
            type: z.ZodOptional<z.ZodUnion<readonly [z.ZodEnum<{
                feature: "feature";
                scaffold: "scaffold";
                refactor: "refactor";
                test: "test";
                docs: "docs";
                config: "config";
                fix: "fix";
            }>, z.ZodArray<z.ZodEnum<{
                feature: "feature";
                scaffold: "scaffold";
                refactor: "refactor";
                test: "test";
                docs: "docs";
                config: "config";
                fix: "fix";
            }>>]>>;
        }, z.core.$strict>;
        model: z.ZodEnum<{
            haiku: "haiku";
            sonnet: "sonnet";
            opus: "opus";
            fable: "fable";
        }>;
        review: z.ZodDefault<z.ZodBoolean>;
    }, z.core.$strict>>;
    escalation: z.ZodArray<z.ZodEnum<{
        haiku: "haiku";
        sonnet: "sonnet";
        opus: "opus";
        fable: "fable";
    }>>;
    max_attempts_per_model: z.ZodNumber;
    budgets: z.ZodObject<{
        default_context: z.ZodNumber;
        max_turns: z.ZodNumber;
    }, z.core.$strict>;
    confirm_expand: z.ZodDefault<z.ZodBoolean>;
    checks: z.ZodDefault<z.ZodObject<{
        build: z.ZodOptional<z.ZodString>;
        lint: z.ZodOptional<z.ZodString>;
        test: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>>;
    fix_loop: z.ZodDefault<z.ZodObject<{
        enabled: z.ZodDefault<z.ZodBoolean>;
        max_rounds: z.ZodDefault<z.ZodNumber>;
        acceptance_check_model: z.ZodDefault<z.ZodEnum<{
            haiku: "haiku";
            sonnet: "sonnet";
            opus: "opus";
            fable: "fable";
        }>>;
        break_if_no_progress: z.ZodDefault<z.ZodBoolean>;
    }, z.core.$strict>>;
    parallelism: z.ZodDefault<z.ZodNumber>;
    optimizations: z.ZodDefault<z.ZodObject<{
        cache_friendly_order: z.ZodDefault<z.ZodBoolean>;
        log_trimming: z.ZodDefault<z.ZodBoolean>;
        tool_restriction: z.ZodDefault<z.ZodBoolean>;
        batch_low_nodes: z.ZodDefault<z.ZodBoolean>;
        deterministic_scaffold: z.ZodDefault<z.ZodBoolean>;
        turn_limits: z.ZodDefault<z.ZodBoolean>;
        repo_map: z.ZodDefault<z.ZodBoolean>;
    }, z.core.$strict>>;
    scaffold_commands: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodString>>;
    mode_b: z.ZodDefault<z.ZodObject<{
        rate_limit_retry: z.ZodDefault<z.ZodObject<{
            enabled: z.ZodDefault<z.ZodBoolean>;
            wait_seconds: z.ZodDefault<z.ZodNumber>;
            max_retries: z.ZodDefault<z.ZodNumber>;
        }, z.core.$strict>>;
    }, z.core.$strict>>;
}, z.core.$loose>;
export type Config = z.infer<typeof ConfigSchema>;
export type Optimizations = z.infer<typeof OptimizationsSchema>;
export {};
