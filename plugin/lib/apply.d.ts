import { z } from "zod";
export declare const PlanSchema: z.ZodObject<{
    nodes: z.ZodArray<z.ZodObject<{
        ref: z.ZodOptional<z.ZodString>;
        kind: z.ZodEnum<{
            epic: "epic";
            feature: "feature";
            task: "task";
            knowledge: "knowledge";
        }>;
        slug: z.ZodString;
        parent: z.ZodOptional<z.ZodString>;
        shared: z.ZodOptional<z.ZodBoolean>;
        summary: z.ZodString;
        depends_on: z.ZodDefault<z.ZodArray<z.ZodString>>;
        reads: z.ZodDefault<z.ZodArray<z.ZodString>>;
        touches: z.ZodDefault<z.ZodArray<z.ZodString>>;
        type: z.ZodOptional<z.ZodEnum<{
            feature: "feature";
            scaffold: "scaffold";
            refactor: "refactor";
            test: "test";
            docs: "docs";
            config: "config";
            fix: "fix";
        }>>;
        complexity: z.ZodOptional<z.ZodEnum<{
            low: "low";
            med: "med";
            high: "high";
        }>>;
        risk: z.ZodOptional<z.ZodEnum<{
            low: "low";
            med: "med";
            high: "high";
        }>>;
        context_size: z.ZodOptional<z.ZodEnum<{
            small: "small";
            medium: "medium";
            large: "large";
        }>>;
        tags: z.ZodOptional<z.ZodArray<z.ZodString>>;
        verify: z.ZodOptional<z.ZodArray<z.ZodString>>;
        body: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
    }, z.core.$strict>>;
    expanded: z.ZodDefault<z.ZodArray<z.ZodString>>;
}, z.core.$strict>;
export type Plan = z.infer<typeof PlanSchema>;
export interface AppliedNode {
    ref?: string;
    id: string;
    filePath: string;
}
export type ApplyResult = {
    ok: true;
    dryRun: boolean;
    created: AppliedNode[];
    expanded: string[];
} | {
    ok: false;
    errors: string[];
};
/**
 * Faz 14 O3 — `gp apply plan.json`. Planner tek bir JSON üretir (düğümler + frontmatter +
 * gövde); CLI hepsini doğrular, sonra yazar. Pilotta planner turlarının çoğu `gp new` →
 * Bash betiğiyle gövde yazma → `gp set summary/type/complexity` döngüsüydü (B4, B7) ve
 * "planner dosya yazmaz" kuralı Bash ile aşılıyordu.
 *
 * Akış: (1) plan şeması + ref/parent/depends_on/reads çözümü — hata varsa HİÇBİR dosya
 * yazılmaz; (2) düğümler sırayla `createNewNode` ile yazılır; (3) `expanded` işaretlenir;
 * (4) `validateGraph` yeni bir hata (ör. döngü) bulursa ya da yazma sırasında hata
 * çıkarsa oluşturulan dosyalar silinir, değiştirilenler geri yüklenir. ID sayaçları geri
 * alınmaz — ID'ler asla yeniden kullanılmaz (`counters.ts`).
 */
export declare function applyPlan(graphRoot: string, rawPlan: unknown, opts?: {
    dryRun?: boolean;
}): ApplyResult;
