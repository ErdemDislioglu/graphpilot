import { readFileSync } from "node:fs";
import matter from "gray-matter";
import {
  EpicFrontmatterSchema,
  FeatureFrontmatterSchema,
  TaskFrontmatterSchema,
  KnowledgeFrontmatterSchema,
} from "./schema/index.js";
import { writeFileAtomic } from "./atomicWrite.js";
import type { Graph } from "./graph/types.js";

export type SetResult = { ok: true } | { ok: false; errors: string[] };

const SCHEMA_BY_KIND = {
  epic: EpicFrontmatterSchema,
  feature: FeatureFrontmatterSchema,
  task: TaskFrontmatterSchema,
  knowledge: KnowledgeFrontmatterSchema,
};

/**
 * `gp set <id> status=done attempts=1` — roadmap/SPEC 2.6.
 *
 * `patch` CLI'dan her zaman STRING değer taşır (`"done"`, `"1"`); mevcut frontmatter
 * alanının tipine göre (`number`/`boolean`/`string`) koerse edilir. Birleştirilmiş
 * frontmatter, yazmadan ÖNCE doğru Zod şemasından geçirilir — geçersizse hiçbir şey
 * yazılmaz ve hata listesi döner (bozuk graph hiç diske düşmez).
 *
 * Atomik yazma (`atomicWrite.ts`); gövde dokunulmadan korunur. İlgili indeksi yeniden
 * üretmek `cli.ts`'in işi (bu fonksiyon dosya mutasyonuyla sınırlı, tek sorumluluk).
 */
export function setFrontmatter(
  graph: Graph,
  nodeId: string,
  patch: Record<string, string>,
): SetResult {
  const node = graph.nodesById.get(nodeId);
  if (!node) return { ok: false, errors: [`düğüm bulunamadı: ${nodeId}`] };

  const raw = readFileSync(node.filePath, "utf-8");
  const parsed = matter(raw);
  const merged: Record<string, unknown> = { ...parsed.data };

  for (const [key, rawValue] of Object.entries(patch)) {
    merged[key] = coerce(merged[key], rawValue);
  }

  const schema = SCHEMA_BY_KIND[node.kind];
  const result = schema.safeParse(merged);
  if (!result.success) {
    return {
      ok: false,
      errors: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
    };
  }

  const output = matter.stringify(parsed.content, result.data);
  writeFileAtomic(node.filePath, output);
  return { ok: true };
}

function coerce(existing: unknown, rawValue: string): unknown {
  if (typeof existing === "number") {
    const n = Number(rawValue);
    return Number.isNaN(n) ? rawValue : n;
  }
  if (typeof existing === "boolean") {
    if (rawValue === "true") return true;
    if (rawValue === "false") return false;
    return rawValue;
  }
  return rawValue;
}
