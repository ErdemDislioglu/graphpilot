import { z } from "zod";
import { FeatureIdSchema, StatusSchema, SummarySchema } from "./common.js";

/** SPEC §4 — roadmap'te tam speslenmemişti, task şemasıyla tutarlı dolduruldu. */
export const FeatureFrontmatterSchema = z
  .object({
    id: FeatureIdSchema,
    kind: z.literal("feature"),
    name: z.string().min(1),
    summary: SummarySchema,
    status: StatusSchema,
    expanded: z.boolean(),
    depends_on: z.array(FeatureIdSchema).default([]),
    // Faz 2 eklemesi — SPEC §8, bkz. task.ts'teki açıklama.
    draft: z.boolean().default(false),
  })
  .strict();

export type FeatureFrontmatter = z.infer<typeof FeatureFrontmatterSchema>;
