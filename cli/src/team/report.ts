import { z } from "zod";
import { estimateTokens } from "../tokens.js";
import { FindingSchema } from "./finding.js";

/**
 * Roadmap 13.6 — ekip üyesinin yöneticiye döndüğü yapılandırılmış rapor. `.strict()`:
 * kod/diff/log gibi beklenmeyen alanlar sessizce geçmez (13.12: "Kod, diff, log, handoff
 * yöneticiye GİRMEZ" — bu şema o kuralı erken, mekanik olarak da zorlar).
 */
export const TeamReportSchema = z
  .object({
    node: z.string().min(1),
    status: z.enum(["done", "blocked", "needs_decision", "failed"]),
    summary: z.string().min(1).max(800),
    findings: z.array(FindingSchema).default([]),
    tokens: z.number().int().nonnegative(),
  })
  .strict();

export type TeamReport = z.infer<typeof TeamReportSchema>;

export function parseTeamReport(raw: unknown): TeamReport {
  const result = TeamReportSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`geçersiz ekip raporu: ${result.error.issues.map((i) => i.message).join("; ")}`);
  }
  return result.data;
}

/** Roadmap 13.6 — "Rapor en fazla ~200 token" (yumuşak bir bütçe, zorlayıcı DEĞİL —
 * sadece ölçülebilir hale getirir; `summary` metninin kendisi tahmin edilir). */
export function estimateReportTokens(report: TeamReport): number {
  const findingsText = report.findings.map((f) => `${f.summary} ${f.options.join(" ")}`).join(" ");
  return estimateTokens(`${report.node} ${report.status} ${report.summary} ${findingsText}`);
}

export function exceedsReportBudget(report: TeamReport, maxTokens = 200): boolean {
  return estimateReportTokens(report) > maxTokens;
}
