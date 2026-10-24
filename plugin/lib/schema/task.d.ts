import { z } from "zod";
/** SPEC §5 — roadmap §1.3'ün birebir karşılığı. */
export declare const TaskFrontmatterSchema: z.ZodObject<{
    id: z.ZodString;
    kind: z.ZodLiteral<"task">;
    name: z.ZodString;
    level: z.ZodLiteral<3>;
    summary: z.ZodString;
    type: z.ZodEnum<{
        feature: "feature";
        scaffold: "scaffold";
        refactor: "refactor";
        test: "test";
        docs: "docs";
        config: "config";
        fix: "fix";
    }>;
    complexity: z.ZodEnum<{
        low: "low";
        med: "med";
        high: "high";
    }>;
    risk: z.ZodEnum<{
        low: "low";
        med: "med";
        high: "high";
    }>;
    context_size: z.ZodEnum<{
        small: "small";
        medium: "medium";
        large: "large";
    }>;
    model: z.ZodEnum<{
        auto: "auto";
        haiku: "haiku";
        sonnet: "sonnet";
        opus: "opus";
        fable: "fable";
    }>;
    agent: z.ZodEnum<{
        docs: "docs";
        auto: "auto";
        coder: "coder";
        tester: "tester";
        senior: "senior";
    }>;
    depends_on: z.ZodDefault<z.ZodArray<z.ZodString>>;
    reads: z.ZodDefault<z.ZodArray<z.ZodString>>;
    touches: z.ZodDefault<z.ZodArray<z.ZodString>>;
    context_budget: z.ZodNumber;
    status: z.ZodEnum<{
        pending: "pending";
        ready: "ready";
        running: "running";
        done: "done";
        failed: "failed";
        blocked: "blocked";
        skipped: "skipped";
        needs_decision: "needs_decision";
    }>;
    attempts: z.ZodDefault<z.ZodNumber>;
    scaffold_stack: z.ZodOptional<z.ZodString>;
    draft: z.ZodDefault<z.ZodBoolean>;
    tags: z.ZodDefault<z.ZodArray<z.ZodString>>;
    assignee: z.ZodDefault<z.ZodEnum<{
        docs: "docs";
        auto: "auto";
        tester: "tester";
        senior: "senior";
        junior: "junior";
    }>>;
}, z.core.$strict>;
export type TaskFrontmatter = z.infer<typeof TaskFrontmatterSchema>;
