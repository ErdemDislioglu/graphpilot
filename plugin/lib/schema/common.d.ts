import { z } from "zod";
/**
 * Paylaşılan enum'lar ve ID yardımcıları.
 * Kaynak: docs/SPEC.md §2 (ID kuralları), §5 (task frontmatter alanları).
 */
/**
 * Faz 2 eklemesi: parser'ın (graph/parser.ts) `kind`'ı Zod-şema-spesifik dağıtımdan
 * ÖNCE genel olarak doğrulaması için. SPEC §3'teki dört düğüm tipi.
 */
export declare const NodeKindSchema: z.ZodEnum<{
    epic: "epic";
    feature: "feature";
    task: "task";
    knowledge: "knowledge";
}>;
export type NodeKind = z.infer<typeof NodeKindSchema>;
export declare const EpicIdSchema: z.ZodString;
export declare const FeatureIdSchema: z.ZodString;
export declare const TaskIdSchema: z.ZodString;
/** Knowledge ID'leri serbest kebab-case slug'dır (hiyerarşi kodlamaz). */
export declare const KnowledgeIdSchema: z.ZodString;
/** `reads` alanındaki [[name]] sözdizimi — knowledge düğümüne wikilink. */
export declare const WikilinkSchema: z.ZodString;
/** Epic/feature/task'in paylaştığı durum makinesi (SPEC §4, §5). */
export declare const StatusSchema: z.ZodEnum<{
    pending: "pending";
    ready: "ready";
    running: "running";
    done: "done";
    failed: "failed";
    blocked: "blocked";
    skipped: "skipped";
    needs_decision: "needs_decision";
}>;
export type Status = z.infer<typeof StatusSchema>;
export declare const ComplexitySchema: z.ZodEnum<{
    low: "low";
    med: "med";
    high: "high";
}>;
export declare const RiskSchema: z.ZodEnum<{
    low: "low";
    med: "med";
    high: "high";
}>;
export declare const ContextSizeSchema: z.ZodEnum<{
    small: "small";
    medium: "medium";
    large: "large";
}>;
export declare const TaskTypeSchema: z.ZodEnum<{
    feature: "feature";
    scaffold: "scaffold";
    refactor: "refactor";
    test: "test";
    docs: "docs";
    config: "config";
    fix: "fix";
}>;
/** `fable` Faz 0 araştırmasına göre eklendi; varsayılan routing tablosu şu an kullanmıyor. */
export declare const ModelSchema: z.ZodEnum<{
    auto: "auto";
    haiku: "haiku";
    sonnet: "sonnet";
    opus: "opus";
    fable: "fable";
}>;
/** `checker` dahili (fix-loop tarafından çağrılır), frontmatter'dan seçilemez.
 * Faz 13 eklemesi: `senior` — ekip modunda "Junior" rolü zaten `coder` (Faz 0 bulgusu:
 * agent varyantı gerekmiyor, model çağrı anında değişir), ama "Senior" GERÇEKTEN farklı
 * bir sistem promptu/yetkiye sahip (bkz. `plugin/agents/senior.md`) — bu yüzden kendi
 * agent değeri var. */
export declare const AgentSchema: z.ZodEnum<{
    docs: "docs";
    auto: "auto";
    coder: "coder";
    tester: "tester";
    senior: "senior";
}>;
/** Faz 13.3 — görev düğümüne elle atama override'ı. `auto`: 13.3'ün tag tablosundan
 * deterministik olarak çözülür (`team/assign.ts`). Diğerleri tabloyu ELLE ezer. */
export declare const AssigneeSchema: z.ZodEnum<{
    docs: "docs";
    auto: "auto";
    tester: "tester";
    senior: "senior";
    junior: "junior";
}>;
/** İndeks satırı için tek satır özet — SPEC §3. */
export declare const SummarySchema: z.ZodString;
