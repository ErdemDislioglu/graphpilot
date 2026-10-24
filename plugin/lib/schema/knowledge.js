import { z } from "zod";
import { KnowledgeIdSchema, SummarySchema, TaskIdSchema } from "./common.js";
/**
 * SPEC §6 — roadmap §1.5'in birebir karşılığı.
 *
 * Düz `ZodObject` olarak tutuluyor (refine YOK) çünkü `node.ts`'teki
 * `z.discriminatedUnion("kind", [...])` her üyenin düz obje olmasını zorunlu kılıyor —
 * bir `.refine()` üyeyi `ZodEffects`'e çevirip union'ı kırar. `id === name` çapraz-alan
 * kuralı bu yüzden aşağıdaki `KnowledgeFrontmatterSchema`'da (bu şeklin üzerine refine
 * eklenmiş hali) uygulanıyor; bağımsız doğrulamada (testler, ileride `gp validate`) onu kullan.
 */
export const KnowledgeFrontmatterShape = z
    .object({
    id: KnowledgeIdSchema,
    kind: z.literal("knowledge"),
    // Knowledge'ta name her zaman id ile eşleşir (SPEC §6) — ayrı bir alan olarak
    // tutuluyor ki parser (Faz 2.2) her kind için aynı `name` okuma yolunu kullanabilsin.
    name: KnowledgeIdSchema,
    summary: SummarySchema,
    scope: z.enum(["epic", "shared"]),
    updated_by: z.array(TaskIdSchema).default([]),
    source_files: z.array(z.string()).default([]),
    // Faz 9.3 eklemesi — `gp sync`'in "kod değişti mi?" karşılaştırması için `source_files`
    // yazıldığı andaki hash'leri. Anahtar = source_files'taki yol, değer = sha256 (hex).
    // Elle tutulmaz; sadece `gp sync --update-hashes` yazar.
    source_hashes: z.record(z.string(), z.string()).default({}),
})
    .strict();
/** Bağımsız doğrulama için: yukarıdaki şekil + `id === name` kuralı. */
export const KnowledgeFrontmatterSchema = KnowledgeFrontmatterShape.refine((v) => v.id === v.name, {
    message: "knowledge düğümünde id ve name her zaman eşit olmalı",
    path: ["name"],
});
