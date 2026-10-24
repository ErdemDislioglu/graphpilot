import { z } from "zod";
/**
 * Graph düğümlerinin `kind` üzerinden discriminated union'ı.
 * `brief.md` ve `config.yml` bu birliğin dışındadır (SPEC §7, §10 — sabit yoldan tanınır,
 * frontmatter şeması zorunlu değil).
 *
 * Knowledge üyesi kasıtlı olarak `KnowledgeFrontmatterShape` (refine'sız düz obje) —
 * bkz. knowledge.ts'teki açıklama. Bağımsız knowledge doğrulaması için
 * `KnowledgeFrontmatterSchema`'yı (id===name kontrollü) kullan.
 */
export declare const NodeFrontmatterSchema: z.ZodDiscriminatedUnion<[z.ZodObject<{
    id: z.ZodString;
    kind: z.ZodLiteral<"epic">;
    name: z.ZodString;
    summary: z.ZodString;
    status: z.ZodEnum<{
        pending: "pending";
        ready: "ready";
        running: "running";
        done: "done";
        failed: "failed";
        blocked: "blocked";
        skipped: "skipped";
    }>;
    expanded: z.ZodBoolean;
    depends_on: z.ZodDefault<z.ZodArray<z.ZodString>>;
    draft: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strict>, z.ZodObject<{
    id: z.ZodString;
    kind: z.ZodLiteral<"feature">;
    name: z.ZodString;
    summary: z.ZodString;
    status: z.ZodEnum<{
        pending: "pending";
        ready: "ready";
        running: "running";
        done: "done";
        failed: "failed";
        blocked: "blocked";
        skipped: "skipped";
    }>;
    expanded: z.ZodBoolean;
    depends_on: z.ZodDefault<z.ZodArray<z.ZodString>>;
    draft: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strict>, z.ZodObject<{
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
    }>;
    attempts: z.ZodDefault<z.ZodNumber>;
    scaffold_stack: z.ZodOptional<z.ZodString>;
    draft: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strict>, z.ZodObject<{
    id: z.ZodString;
    kind: z.ZodLiteral<"knowledge">;
    name: z.ZodString;
    summary: z.ZodString;
    scope: z.ZodEnum<{
        epic: "epic";
        shared: "shared";
    }>;
    updated_by: z.ZodDefault<z.ZodArray<z.ZodString>>;
    source_files: z.ZodDefault<z.ZodArray<z.ZodString>>;
    source_hashes: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodString>>;
}, z.core.$strict>], "kind">;
export type NodeFrontmatter = z.infer<typeof NodeFrontmatterSchema>;
