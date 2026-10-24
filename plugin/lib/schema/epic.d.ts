import { z } from "zod";
/** SPEC §4 — roadmap'te tam speslenmemişti, task şemasıyla tutarlı dolduruldu. */
export declare const EpicFrontmatterSchema: z.ZodObject<{
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
}, z.core.$strict>;
export type EpicFrontmatter = z.infer<typeof EpicFrontmatterSchema>;
