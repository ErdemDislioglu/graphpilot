import { z } from "zod";
/**
 * Paylaşılan enum'lar ve ID yardımcıları.
 * Kaynak: docs/SPEC.md §2 (ID kuralları), §5 (task frontmatter alanları).
 */
/**
 * Faz 2 eklemesi: parser'ın (graph/parser.ts) `kind`'ı Zod-şema-spesifik dağıtımdan
 * ÖNCE genel olarak doğrulaması için. SPEC §3'teki dört düğüm tipi.
 */
export const NodeKindSchema = z.enum(["epic", "feature", "task", "knowledge"]);
export const EpicIdSchema = z.string().regex(/^E\d{2}$/, "Epic ID biçimi: E<2 hane> (örn. E01)");
export const FeatureIdSchema = z
    .string()
    .regex(/^E\d{2}-F\d{2}$/, "Feature ID biçimi: E<2 hane>-F<2 hane> (örn. E01-F02)");
export const TaskIdSchema = z
    .string()
    .regex(/^E\d{2}-F\d{2}-T\d{2}$/, "Task ID biçimi: E<2>-F<2>-T<2> (örn. E01-F02-T03)");
/** Knowledge ID'leri serbest kebab-case slug'dır (hiyerarşi kodlamaz). */
export const KnowledgeIdSchema = z
    .string()
    .regex(/^[a-z][a-z0-9-]*$/, "Knowledge ID kebab-case olmalı (örn. catalog-api)");
/** `reads` alanındaki [[name]] sözdizimi — knowledge düğümüne wikilink. */
export const WikilinkSchema = z
    .string()
    .regex(/^\[\[[a-z][a-z0-9-]*\]\]$/, "Wikilink biçimi: [[name]] (örn. [[catalog-api]])");
/** Epic/feature/task'in paylaştığı durum makinesi (SPEC §4, §5). */
export const StatusSchema = z.enum([
    "pending",
    "ready",
    "running",
    "done",
    "failed",
    "blocked",
    "skipped",
]);
export const ComplexitySchema = z.enum(["low", "med", "high"]);
export const RiskSchema = z.enum(["low", "med", "high"]);
export const ContextSizeSchema = z.enum(["small", "medium", "large"]);
export const TaskTypeSchema = z.enum([
    "scaffold",
    "feature",
    "refactor",
    "test",
    "docs",
    "config",
    "fix",
]);
/** `fable` Faz 0 araştırmasına göre eklendi; varsayılan routing tablosu şu an kullanmıyor. */
export const ModelSchema = z.enum(["auto", "haiku", "sonnet", "opus", "fable"]);
/** `checker` dahili (fix-loop tarafından çağrılır), frontmatter'dan seçilemez. */
export const AgentSchema = z.enum(["auto", "coder", "tester", "docs"]);
/** İndeks satırı için tek satır özet — SPEC §3. */
export const SummarySchema = z.string().max(100, "summary en fazla 100 karakter olmalı");
