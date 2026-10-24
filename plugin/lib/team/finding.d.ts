import { z } from "zod";
/**
 * Roadmap 13.7 — ekip üyesinin "sessizce karar vermek" yerine bildirdiği bulgu.
 * `gp check`'in `--json-schema` deseniyle aynı felsefe (ADR-008): LLM JSON üretir, CLI
 * doğrular — yorumlamaz. `.strict()`: ekip üyesi beklenmeyen bir alan eklerse (ör. kod
 * parçası) sessizce geçmez, hata verir (13.9'un "mesajlarda kod/gizli bilgi gönderilmez"
 * ilkesini erken yakalar — her ne kadar bu asıl Telegram mesaj katmanının işi olsa da).
 */
export declare const FindingSchema: z.ZodObject<{
    kind: z.ZodEnum<{
        security: "security";
        ambiguity: "ambiguity";
        plan_conflict: "plan_conflict";
        out_of_scope: "out_of_scope";
        tech_debt: "tech_debt";
    }>;
    severity: z.ZodEnum<{
        blocking: "blocking";
        non_blocking: "non_blocking";
    }>;
    summary: z.ZodString;
    options: z.ZodArray<z.ZodString>;
    recommended: z.ZodNumber;
}, z.core.$strict>;
export type Finding = z.infer<typeof FindingSchema>;
/** Ham JSON'u (bir ekip üyesinin ürettiği metin) doğrular — geçersizse açık hata fırlatır
 * (sessiz varsayım yok, "model düşünür, script çalışır" ilkesi). */
export declare function parseFinding(raw: unknown): Finding;
