import { z } from "zod";
import {
  AgentSchema,
  AssigneeSchema,
  ComplexitySchema,
  ContextSizeSchema,
  ModelSchema,
  RiskSchema,
  StatusSchema,
  SummarySchema,
  TaskIdSchema,
  TaskTypeSchema,
  WikilinkSchema,
} from "./common.js";

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
    // Faz 13.3 eklemesi — serbest etiketler (ör. ["auth", "security"]). Atama tablosu
    // (`team/assign.ts`) bunları `architecture`/`security`/`data_model`/`integration`
    // için okur; roadmap §13.4'ün deterministik düzeltme kuralları da bunu üretir.
    tags: z.array(z.string().min(1)).default([]),
    // Faz 13.3 eklemesi — `auto` ise tag tablosundan çözülür, değilse elle ezer.
    assignee: AssigneeSchema.default("auto"),
    // Faz 14 O9 — görevin çalıştırılabilir doğrulama komutları (ör. "node --test test/x.test.js").
    // `gp verify <id>` hepsini proje kökünde çalıştırır; Katman 1'i deterministik yapar ve
    // git'siz modda Katman 2'nin (diff'e dayalı `gp check`) yerini tutar (B11).
    verify: z.array(z.string().min(1)).default([]),
    // Roadmap 12.6 düzeltmesi — `risk: high` görev otopilotta bir kez onaylandı; bir daha
    // sorulmaz (onay kalıcı, süreç yeniden başlasa da). Yoksa = henüz onaylanmadı.
    approved: z.boolean().optional(),
  })
  .strict();

export type TaskFrontmatter = z.infer<typeof TaskFrontmatterSchema>;
