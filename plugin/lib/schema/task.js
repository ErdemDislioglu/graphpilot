import { z } from "zod";
import { AgentSchema, ComplexitySchema, ContextSizeSchema, ModelSchema, RiskSchema, StatusSchema, SummarySchema, TaskIdSchema, TaskTypeSchema, WikilinkSchema, } from "./common.js";
/** SPEC §5 — roadmap §1.3'ün birebir karşılığı. */
export const TaskFrontmatterSchema = z
    .object({
    id: TaskIdSchema,
    kind: z.literal("task"),
    name: z.string().min(1),
    level: z.literal(3),
    summary: SummarySchema,
    type: TaskTypeSchema,
    complexity: ComplexitySchema,
    risk: RiskSchema,
    context_size: ContextSizeSchema,
    model: ModelSchema,
    agent: AgentSchema,
    depends_on: z.array(TaskIdSchema).default([]),
    reads: z.array(WikilinkSchema).default([]),
    touches: z.array(z.string()).default([]),
    context_budget: z.number().int().positive(),
    status: StatusSchema,
    attempts: z.number().int().nonnegative().default(0),
    // Faz 7.6 eklemesi: sadece `type: scaffold` task'ları için — `config.yml`'deki
    // `scaffold_commands` tablosunun anahtarı (ör. "vite-react"). `gp scaffold` bunu okur.
    scaffold_stack: z.string().optional(),
    // Faz 2 eklemesi: SPEC §8 "Var olmayan link = hata (taslak düğümler hariç)" kuralının
    // somut mekanizması. draft:true ise bu düğümden çıkan depends_on/reads hedeflerinin
    // henüz var olmaması gp validate'te hata sayılmaz (gp validate.ts, "draft" kontrolü).
    draft: z.boolean().default(false),
})
    .strict();
