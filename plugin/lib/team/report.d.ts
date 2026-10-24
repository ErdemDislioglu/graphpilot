import { z } from "zod";
/**
 * Roadmap 13.6 — ekip üyesinin yöneticiye döndüğü yapılandırılmış rapor. `.strict()`:
 * kod/diff/log gibi beklenmeyen alanlar sessizce geçmez (13.12: "Kod, diff, log, handoff
 * yöneticiye GİRMEZ" — bu şema o kuralı erken, mekanik olarak da zorlar).
 */
export declare const TeamReportSchema: z.ZodObject<{
    node: z.ZodString;
    status: z.ZodEnum<{
        done: "done";
        failed: "failed";
        blocked: "blocked";
        needs_decision: "needs_decision";
    }>;
    summary: z.ZodString;
    findings: z.ZodDefault<z.ZodArray<z.ZodObject<{
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
    }, z.core.$strict>>>;
    tokens: z.ZodNumber;
}, z.core.$strict>;
export type TeamReport = z.infer<typeof TeamReportSchema>;
export declare function parseTeamReport(raw: unknown): TeamReport;
/** Roadmap 13.6 — "Rapor en fazla ~200 token" (yumuşak bir bütçe, zorlayıcı DEĞİL —
 * sadece ölçülebilir hale getirir; `summary` metninin kendisi tahmin edilir). */
export declare function estimateReportTokens(report: TeamReport): number;
export declare function exceedsReportBudget(report: TeamReport, maxTokens?: number): boolean;
