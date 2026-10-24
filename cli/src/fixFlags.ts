import { readFileSync } from "node:fs";
import matter from "gray-matter";
import { setFrontmatter } from "./set.js";
import { writeFileAtomic } from "./atomicWrite.js";
import { TaskFrontmatterSchema } from "./schema/index.js";
import { tasksOf } from "./graph/types.js";
import type { Graph } from "./graph/types.js";

export interface FlagFix {
  nodeId: string;
  field: string;
  from: unknown;
  to: unknown;
}

const TOUCHES_TAG_RULES: { pattern: RegExp; tag: string }[] = [
  { pattern: /auth/i, tag: "security" },
  { pattern: /payment/i, tag: "security" },
  { pattern: /migration/i, tag: "data_model" },
];

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

/**
 * SPEC/roadmap 5.3 — `gp validate --fix-flags`'in deterministik düzeltme kuralları.
 * Faz 13.4 eklemesi: tag kalitesini korumak için üç yeni kural (`touches`'taki
 * auth/payment/migration → security/data_model tag + en az `med` complexity; cross-epic
 * bağımlılık → `architecture` tag). Saf fonksiyon: ne değişeceğini HESAPLAR, yazmaz.
 */
export function computeFlagFixes(graph: Graph): FlagFix[] {
  const fixes: FlagFix[] = [];
  const tasks = tasksOf(graph);

  for (const task of tasks) {
    const touches = asStringArray(task.frontmatter.touches);
    const contextSize = task.frontmatter.context_size;
    if (touches.length > 5 && contextSize !== "large") {
      fixes.push({ nodeId: task.id, field: "context_size", from: contextSize, to: "large" });
    }

    const type = task.frontmatter.type;
    const complexity = task.frontmatter.complexity;
    if (type === "docs" && complexity === "high") {
      fixes.push({ nodeId: task.id, field: "complexity", from: complexity, to: "med" });
    }

    // Faz 13.4 — iki kuralın birleşik tag hesaplaması (tek bir "tags" fix'i üretmek için
    // — ikisi de tetiklenirse AYRI AYRI fix pushlamak aynı alana çakışan/kafa karıştırıcı
    // iki düzeltme üretirdi). (1) "touches içinde auth/payment/migration → security/
    // data_model" (hangi kelimenin hangi tag'e eşlendiği roadmap'te net değildi: auth/
    // payment → security, migration → data_model seçildi — güvenlik riski vs. veri
    // bütünlüğü riski ayrımı). (2) "Başka epic'e bağımlılığı olan ve arayüz tanımlayan
    // görev → architecture tag'i" — deterministik karşılığı: BAŞKA bir epic'teki bir görev
    // BUNA bağımlıysa, bu görev epic sınırını aşan bir sözleşme tanımlıyor demektir
    // ("arayüz tanımlayan" koşulu bundan ayrı, bağımsız kontrol edilebilir bir sinyal
    // değil — aynı koşulun doğal sonucu olarak yorumlandı).
    const existingTags = asStringArray(task.frontmatter.tags);
    const neededTags = new Set(existingTags);
    let touchesRuleTriggered = false;
    for (const { pattern, tag } of TOUCHES_TAG_RULES) {
      if (touches.some((t) => pattern.test(t))) {
        neededTags.add(tag);
        touchesRuleTriggered = true;
      }
    }
    const isCrossEpicInterface = graph.edges.some((e) => {
      if (e.type !== "depends_on" || e.to !== task.id) return false;
      const dependent = graph.nodesById.get(e.from);
      return dependent !== undefined && dependent.epicId !== task.epicId;
    });
    if (isCrossEpicInterface) neededTags.add("architecture");

    if (neededTags.size > existingTags.length) {
      fixes.push({ nodeId: task.id, field: "tags", from: existingTags, to: [...neededTags] });
      // "en az med" sadece touches/auth-payment-migration kuralına bağlı (roadmap'in
      // literal metni) — cross-epic/architecture kuralı complexity'yi etkilemez.
      if (touchesRuleTriggered && complexity === "low") {
        fixes.push({ nodeId: task.id, field: "complexity", from: complexity, to: "med" });
      }
    }
  }

  return fixes;
}

/**
 * Hesaplanan düzeltmeleri gerçekten uygular. Skaler alanlar (`context_size`,
 * `complexity`) `gp set`'in yolundan geçer (`setFrontmatter`); `tags` dizi olduğu için
 * `gp set`/`setFrontmatter` ONU KOERSE ETMEZ (kasıtlı — bkz. `set.ts`'in kendi notu),
 * bu yüzden doğrudan okuma/doğrulama/atomik yazma ile uygulanır (`newNode.ts`'in
 * `depends_on`/`reads` için kullandığı yolla aynı prensip).
 */
export function applyFlagFixes(graph: Graph, fixes: FlagFix[]): void {
  for (const fix of fixes) {
    if (fix.field === "tags") {
      applyTagsFix(graph, fix.nodeId, Array.isArray(fix.to) ? fix.to.map(String) : []);
      continue;
    }
    const result = setFrontmatter(graph, fix.nodeId, { [fix.field]: String(fix.to) });
    if (!result.ok) {
      throw new Error(
        `flag düzeltmesi uygulanamadı (${fix.nodeId}.${fix.field}): ${result.errors.join("; ")}`,
      );
    }
  }
}

function applyTagsFix(graph: Graph, nodeId: string, tags: string[]): void {
  const node = graph.nodesById.get(nodeId);
  if (!node) throw new Error(`flag düzeltmesi uygulanamadı: düğüm bulunamadı: ${nodeId}`);

  const parsed = matter(readFileSync(node.filePath, "utf-8"));
  const merged = { ...parsed.data, tags };
  const result = TaskFrontmatterSchema.safeParse(merged);
  if (!result.success) {
    throw new Error(
      `flag düzeltmesi uygulanamadı (${nodeId}.tags): ${result.error.issues.map((i) => i.message).join("; ")}`,
    );
  }
  writeFileAtomic(node.filePath, matter.stringify(parsed.content, result.data));
}
