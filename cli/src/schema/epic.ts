import { z } from "zod";
import { EpicIdSchema, StatusSchema, SummarySchema } from "./common.js";

/** SPEC §4 — roadmap'te tam speslenmemişti, task şemasıyla tutarlı dolduruldu. */
export const EpicFrontmatterSchema = z
  .object({
    id: EpicIdSchema,
    kind: z.literal("epic"),
    name: z.string().min(1),
    summary: SummarySchema,
    status: StatusSchema,
    expanded: z.boolean(),
    depends_on: z.array(EpicIdSchema).default([]),
    // Faz 2 eklemesi — SPEC §8, bkz. task.ts'teki açıklama.
    draft: z.boolean().default(false),
  })
  .strict();

export type EpicFrontmatter = z.infer<typeof EpicFrontmatterSchema>;
