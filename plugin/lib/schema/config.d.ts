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
declare const AutopilotSchema: z.ZodObject<{
    enabled: z.ZodDefault<z.ZodBoolean>;
    scope: z.ZodDefault<z.ZodString>;
    notify: z.ZodDefault<z.ZodObject<{
        channel: z.ZodDefault<z.ZodLiteral<"telegram">>;
        on: z.ZodDefault<z.ZodArray<z.ZodEnum<{
            epic_done: "epic_done";
            phase_done: "phase_done";
            failure: "failure";
            limit: "limit";
            finished: "finished";
        }>>>;
        verbosity: z.ZodDefault<z.ZodEnum<{
            short: "short";
            detailed: "detailed";
        }>>;
    }, z.core.$strict>>;
    approvals: z.ZodDefault<z.ZodObject<{
        on_failure: z.ZodDefault<z.ZodEnum<{
            ask: "ask";
            skip: "skip";
            stop: "stop";
        }>>;
        timeout_minutes: z.ZodDefault<z.ZodNumber>;
        timeout_action: z.ZodDefault<z.ZodEnum<{
            skip: "skip";
            stop: "stop";
        }>>;
        on_risk_high: z.ZodDefault<z.ZodBoolean>;
    }, z.core.$strict>>;
    limits: z.ZodDefault<z.ZodObject<{
        wait_for_reset: z.ZodDefault<z.ZodBoolean>;
        max_wait_hours: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strict>>;
    quiet_hours: z.ZodOptional<z.ZodString>;
    language: z.ZodDefault<z.ZodEnum<{
        tr: "tr";
        en: "en";
    }>>;
}, z.core.$strict>;
declare const TeamSchema: z.ZodObject<{
    enabled: z.ZodDefault<z.ZodBoolean>;
    manager: z.ZodDefault<z.ZodObject<{
        model: z.ZodDefault<z.ZodEnum<{
            haiku: "haiku";
            sonnet: "sonnet";
            opus: "opus";
            fable: "fable";
        }>>;
        consult_senior_for: z.ZodDefault<z.ZodArray<z.ZodString>>;
        autonomy: z.ZodDefault<z.ZodEnum<{
            cautious: "cautious";
            balanced: "balanced";
            bold: "bold";
        }>>;
    }, z.core.$strict>>;
    junior: z.ZodDefault<z.ZodObject<{
        low: z.ZodDefault<z.ZodEnum<{
            haiku: "haiku";
            sonnet: "sonnet";
            opus: "opus";
            fable: "fable";
        }>>;
        med: z.ZodDefault<z.ZodEnum<{
            haiku: "haiku";
            sonnet: "sonnet";
            opus: "opus";
            fable: "fable";
        }>>;
        max_parallel: z.ZodDefault<z.ZodNumber>;
        budget_pct: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strict>>;
    senior: z.ZodDefault<z.ZodObject<{
        model: z.ZodDefault<z.ZodEnum<{
            haiku: "haiku";
            sonnet: "sonnet";
            opus: "opus";
            fable: "fable";
        }>>;
        max_parallel: z.ZodDefault<z.ZodNumber>;
        budget_pct: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strict>>;
    tester: z.ZodDefault<z.ZodObject<{
        model: z.ZodDefault<z.ZodEnum<{
            haiku: "haiku";
            sonnet: "sonnet";
            opus: "opus";
            fable: "fable";
        }>>;
        upgrade_to: z.ZodDefault<z.ZodEnum<{
            haiku: "haiku";
            sonnet: "sonnet";
            opus: "opus";
            fable: "fable";
        }>>;
        budget_pct: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strict>>;
    reviewer: z.ZodDefault<z.ZodObject<{
        enabled: z.ZodDefault<z.ZodBoolean>;
        triage: z.ZodDefault<z.ZodEnum<{
            haiku: "haiku";
            sonnet: "sonnet";
            opus: "opus";
            fable: "fable";
        }>>;
        deep: z.ZodDefault<z.ZodEnum<{
            haiku: "haiku";
            sonnet: "sonnet";
            opus: "opus";
            fable: "fable";
        }>>;
    }, z.core.$strict>>;
    docs: z.ZodDefault<z.ZodObject<{
        model: z.ZodDefault<z.ZodEnum<{
            haiku: "haiku";
            sonnet: "sonnet";
            opus: "opus";
            fable: "fable";
        }>>;
        budget_pct: z.ZodOptional<z.ZodNumber>;
    }, z.core.$strict>>;
}, z.core.$strict>;
declare const EfficiencySchema: z.ZodObject<{
    small_epic_max_features: z.ZodDefault<z.ZodNumber>;
    small_epic_max_tasks: z.ZodDefault<z.ZodNumber>;
    merge_interface_task: z.ZodDefault<z.ZodBoolean>;
    separate_test_min_risk: z.ZodDefault<z.ZodEnum<{
        low: "low";
        med: "med";
        high: "high";
    }>>;
    expansion_model: z.ZodDefault<z.ZodEnum<{
        haiku: "haiku";
        sonnet: "sonnet";
        opus: "opus";
        fable: "fable";
    }>>;
    feature_agent: z.ZodDefault<z.ZodBoolean>;
    feature_agent_max_tasks: z.ZodDefault<z.ZodNumber>;
    doc_budget: z.ZodDefault<z.ZodObject<{
        task_body: z.ZodDefault<z.ZodNumber>;
        feature_body: z.ZodDefault<z.ZodNumber>;
        epic_body: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strict>>;
    small_project_warn_tasks: z.ZodDefault<z.ZodNumber>;
}, z.core.$strict>;
export declare const DEFAULT_EFFICIENCY: {
    small_epic_max_features: number;
    small_epic_max_tasks: number;
    merge_interface_task: boolean;
    separate_test_min_risk: "low" | "med" | "high";
    expansion_model: "haiku" | "sonnet" | "opus" | "fable";
    feature_agent: boolean;
    feature_agent_max_tasks: number;
    doc_budget: {
        task_body: number;
        feature_body: number;
        epic_body: number;
    };
    small_project_warn_tasks: number;
};
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
    autopilot: z.ZodDefault<z.ZodObject<{
        enabled: z.ZodDefault<z.ZodBoolean>;
        scope: z.ZodDefault<z.ZodString>;
        notify: z.ZodDefault<z.ZodObject<{
            channel: z.ZodDefault<z.ZodLiteral<"telegram">>;
            on: z.ZodDefault<z.ZodArray<z.ZodEnum<{
                epic_done: "epic_done";
                phase_done: "phase_done";
                failure: "failure";
                limit: "limit";
                finished: "finished";
            }>>>;
            verbosity: z.ZodDefault<z.ZodEnum<{
                short: "short";
                detailed: "detailed";
            }>>;
        }, z.core.$strict>>;
        approvals: z.ZodDefault<z.ZodObject<{
            on_failure: z.ZodDefault<z.ZodEnum<{
                ask: "ask";
                skip: "skip";
                stop: "stop";
            }>>;
            timeout_minutes: z.ZodDefault<z.ZodNumber>;
            timeout_action: z.ZodDefault<z.ZodEnum<{
                skip: "skip";
                stop: "stop";
            }>>;
            on_risk_high: z.ZodDefault<z.ZodBoolean>;
        }, z.core.$strict>>;
        limits: z.ZodDefault<z.ZodObject<{
            wait_for_reset: z.ZodDefault<z.ZodBoolean>;
            max_wait_hours: z.ZodDefault<z.ZodNumber>;
        }, z.core.$strict>>;
        quiet_hours: z.ZodOptional<z.ZodString>;
        language: z.ZodDefault<z.ZodEnum<{
            tr: "tr";
            en: "en";
        }>>;
    }, z.core.$strict>>;
    efficiency: z.ZodDefault<z.ZodObject<{
        small_epic_max_features: z.ZodDefault<z.ZodNumber>;
        small_epic_max_tasks: z.ZodDefault<z.ZodNumber>;
        merge_interface_task: z.ZodDefault<z.ZodBoolean>;
        separate_test_min_risk: z.ZodDefault<z.ZodEnum<{
            low: "low";
            med: "med";
            high: "high";
        }>>;
        expansion_model: z.ZodDefault<z.ZodEnum<{
            haiku: "haiku";
            sonnet: "sonnet";
            opus: "opus";
            fable: "fable";
        }>>;
        feature_agent: z.ZodDefault<z.ZodBoolean>;
        feature_agent_max_tasks: z.ZodDefault<z.ZodNumber>;
        doc_budget: z.ZodDefault<z.ZodObject<{
            task_body: z.ZodDefault<z.ZodNumber>;
            feature_body: z.ZodDefault<z.ZodNumber>;
            epic_body: z.ZodDefault<z.ZodNumber>;
        }, z.core.$strict>>;
        small_project_warn_tasks: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strict>>;
    team: z.ZodDefault<z.ZodObject<{
        enabled: z.ZodDefault<z.ZodBoolean>;
        manager: z.ZodDefault<z.ZodObject<{
            model: z.ZodDefault<z.ZodEnum<{
                haiku: "haiku";
                sonnet: "sonnet";
                opus: "opus";
                fable: "fable";
            }>>;
            consult_senior_for: z.ZodDefault<z.ZodArray<z.ZodString>>;
            autonomy: z.ZodDefault<z.ZodEnum<{
                cautious: "cautious";
                balanced: "balanced";
                bold: "bold";
            }>>;
        }, z.core.$strict>>;
        junior: z.ZodDefault<z.ZodObject<{
            low: z.ZodDefault<z.ZodEnum<{
                haiku: "haiku";
                sonnet: "sonnet";
                opus: "opus";
                fable: "fable";
            }>>;
            med: z.ZodDefault<z.ZodEnum<{
                haiku: "haiku";
                sonnet: "sonnet";
                opus: "opus";
                fable: "fable";
            }>>;
            max_parallel: z.ZodDefault<z.ZodNumber>;
            budget_pct: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strict>>;
        senior: z.ZodDefault<z.ZodObject<{
            model: z.ZodDefault<z.ZodEnum<{
                haiku: "haiku";
                sonnet: "sonnet";
                opus: "opus";
                fable: "fable";
            }>>;
            max_parallel: z.ZodDefault<z.ZodNumber>;
            budget_pct: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strict>>;
        tester: z.ZodDefault<z.ZodObject<{
            model: z.ZodDefault<z.ZodEnum<{
                haiku: "haiku";
                sonnet: "sonnet";
                opus: "opus";
                fable: "fable";
            }>>;
            upgrade_to: z.ZodDefault<z.ZodEnum<{
                haiku: "haiku";
                sonnet: "sonnet";
                opus: "opus";
                fable: "fable";
            }>>;
            budget_pct: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strict>>;
        reviewer: z.ZodDefault<z.ZodObject<{
            enabled: z.ZodDefault<z.ZodBoolean>;
            triage: z.ZodDefault<z.ZodEnum<{
                haiku: "haiku";
                sonnet: "sonnet";
                opus: "opus";
                fable: "fable";
            }>>;
            deep: z.ZodDefault<z.ZodEnum<{
                haiku: "haiku";
                sonnet: "sonnet";
                opus: "opus";
                fable: "fable";
            }>>;
        }, z.core.$strict>>;
        docs: z.ZodDefault<z.ZodObject<{
            model: z.ZodDefault<z.ZodEnum<{
                haiku: "haiku";
                sonnet: "sonnet";
                opus: "opus";
                fable: "fable";
            }>>;
            budget_pct: z.ZodOptional<z.ZodNumber>;
        }, z.core.$strict>>;
    }, z.core.$strict>>;
}, z.core.$loose>;
export type Config = z.infer<typeof ConfigSchema>;
export type Optimizations = z.infer<typeof OptimizationsSchema>;
export type AutopilotConfig = z.infer<typeof AutopilotSchema>;
export type TeamConfig = z.infer<typeof TeamSchema>;
export type EfficiencyConfig = z.infer<typeof EfficiencySchema>;
export {};
