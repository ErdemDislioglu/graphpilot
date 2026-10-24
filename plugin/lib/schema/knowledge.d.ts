import { z } from "zod";
/**
 * SPEC §6 — roadmap §1.5'in birebir karşılığı.
 *
 * Düz `ZodObject` olarak tutuluyor (refine YOK) çünkü `node.ts`'teki
 * `z.discriminatedUnion("kind", [...])` her üyenin düz obje olmasını zorunlu kılıyor —
 * bir `.refine()` üyeyi `ZodEffects`'e çevirip union'ı kırar. `id === name` çapraz-alan
 * kuralı bu yüzden aşağıdaki `KnowledgeFrontmatterSchema`'da (bu şeklin üzerine refine
 * eklenmiş hali) uygulanıyor; bağımsız doğrulamada (testler, ileride `gp validate`) onu kullan.
 */
export declare const KnowledgeFrontmatterShape: z.ZodObject<{
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
}, z.core.$strict>;
/** Bağımsız doğrulama için: yukarıdaki şekil + `id === name` kuralı. */
export declare const KnowledgeFrontmatterSchema: z.ZodObject<{
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
}, z.core.$strict>;
export type KnowledgeFrontmatter = z.infer<typeof KnowledgeFrontmatterShape>;
