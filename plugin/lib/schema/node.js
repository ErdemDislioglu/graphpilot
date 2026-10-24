import { z } from "zod";
import { EpicFrontmatterSchema } from "./epic.js";
import { FeatureFrontmatterSchema } from "./feature.js";
import { TaskFrontmatterSchema } from "./task.js";
import { KnowledgeFrontmatterShape } from "./knowledge.js";
/**
 * Graph düğümlerinin `kind` üzerinden discriminated union'ı.
 * `brief.md` ve `config.yml` bu birliğin dışındadır (SPEC §7, §10 — sabit yoldan tanınır,
 * frontmatter şeması zorunlu değil).
 *
 * Knowledge üyesi kasıtlı olarak `KnowledgeFrontmatterShape` (refine'sız düz obje) —
 * bkz. knowledge.ts'teki açıklama. Bağımsız knowledge doğrulaması için
 * `KnowledgeFrontmatterSchema`'yı (id===name kontrollü) kullan.
 */
export const NodeFrontmatterSchema = z.discriminatedUnion("kind", [
    EpicFrontmatterSchema,
    FeatureFrontmatterSchema,
    TaskFrontmatterSchema,
    KnowledgeFrontmatterShape,
]);
