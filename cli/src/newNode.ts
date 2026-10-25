import { dirname, join } from "node:path";
import matter from "gray-matter";
import { nextCounterValue } from "./counters.js";
import {
  EpicFrontmatterSchema,
  FeatureFrontmatterSchema,
  KnowledgeFrontmatterSchema,
  SummarySchema,
  TaskFrontmatterSchema,
} from "./schema/index.js";
import { writeFileAtomic } from "./atomicWrite.js";
import {
  renderEpicTemplate,
  renderFeatureTemplate,
  renderKnowledgeTemplate,
  renderTaskTemplate,
} from "./templates.js";
import type { TaskTemplateExtras } from "./templates.js";
import type { Graph, GraphNode } from "./graph/types.js";

const SLUG_RE = /^[a-z][a-z0-9-]*$/;

export interface NewNodeOptions {
  kind: "epic" | "feature" | "task" | "knowledge";
  slug: string;
  /** feature/task/epic-knowledge için zorunlu: epic id (feature/knowledge) veya feature id (task). */
  parent?: string;
  summary?: string;
  /** knowledge: true → `_shared/knowledge/`, false/undefined → epic'in kendi `knowledge/`'ı. */
  shared?: boolean;
  /**
   * Faz 4 eklemesi: oluşturulurken `depends_on`'u doğrudan doldur (epic/feature/task).
   * `/gp:plan` epic'leri bağımlılık sırasıyla yazarken buna ihtiyaç duyar — `gp set`
   * dizi alanları koerse etmiyor (kasıtlı, bkz. set.ts), bu yüzden ayrı bir yol.
   * Her ID, aynı türden ve zaten var olmalı — aksi halde hata (fail-fast, bozuk graph yazılmaz).
   */
  dependsOn?: string[];
  /**
   * Faz 5 eklemesi — aynı gerekçe (`gp set` dizi alanlarını koerse etmiyor). Sadece
   * `kind: task`. Her isim bare (örn. "catalog-api", `[[..]]` DEĞİL) ve zaten var olan
   * bir knowledge düğümüne ait olmalı — aksi halde hata.
   */
  reads?: string[];
  /** Faz 5 eklemesi — sadece `kind: task`. Glob desenleri, varlık kontrolü YAPILMAZ. */
  touches?: string[];
  /** Faz 14 B7b — sadece `kind: task`: type/complexity/risk/context_size/tags/verify. */
  task?: TaskTemplateExtras;
  /**
   * Faz 14 O3/B4 — gövde bölümleri (`{ "Görev": "...", "Kabul kriterleri": "..." }`).
   * Şablondaki `(TODO)` yerine yazılır; şablonda olmayan bölüm sona eklenir.
   */
  body?: Record<string, string>;
}

export interface NewNodeResult {
  id: string;
  filePath: string;
}

/**
 * SPEC/roadmap 2.10 — `gp new <kind> --parent <id> --slug <slug>`. Agent'lar yeni
 * düğümü elle yazmak yerine bunu çağırır; format hatası olmaz, ID asla çakışmaz/yeniden
 * kullanılmaz (`counters.ts`).
 */
export function createNewNode(graph: Graph, opts: NewNodeOptions): NewNodeResult {
  if (!SLUG_RE.test(opts.slug)) {
    throw new Error(`geçersiz slug: "${opts.slug}" (kebab-case olmalı, örn. search-api)`);
  }
  const summary = opts.summary ?? "(TODO özet)";
  // Faz 14 B7a — eskiden >100 karakter summary kabul ediliyor, sonra `gp validate` reddediyordu.
  const summaryCheck = SummarySchema.safeParse(summary);
  if (!summaryCheck.success) {
    throw new Error(`summary: ${summaryCheck.error.issues[0]?.message ?? "geçersiz"}`);
  }

  switch (opts.kind) {
    case "epic":
      return createEpic(graph, opts, summary);
    case "feature":
      return createFeature(graph, opts, summary);
    case "task":
      return createTask(graph, opts, summary);
    case "knowledge":
      return createKnowledge(graph, opts, summary);
  }
}

function createEpic(graph: Graph, opts: NewNodeOptions, summary: string): NewNodeResult {
  const existingMax = maxNumber(graph, /^E(\d{2})$/);
  const num = nextCounterValue(graph.rootDir, "E", existingMax);
  const id = `E${pad(num)}`;
  const name = `${id}-${opts.slug}`;
  ensureNameFree(graph, name);
  const dependsOn = validateDependsOn(graph, opts.dependsOn, "epic");
  const filePath = join(graph.rootDir, name, "epic.md");
  writeNodeFile(filePath, renderEpicTemplate(id, name, summary, dependsOn), "epic", opts.body);
  return { id, filePath };
}

function createFeature(graph: Graph, opts: NewNodeOptions, summary: string): NewNodeResult {
  const parentId = requireParent(opts, "epic (ör. E01)");
  const epic = requireNode(graph, parentId, "epic");
  const existingMax = maxNumber(graph, new RegExp(`^${esc(parentId)}-F(\\d{2})$`));
  const num = nextCounterValue(graph.rootDir, parentId, existingMax);
  const id = `${parentId}-F${pad(num)}`;
  const name = `F${pad(num)}-${opts.slug}`;
  ensureNameFree(graph, name);
  const dependsOn = validateDependsOn(graph, opts.dependsOn, "feature");
  const filePath = join(dirname(epic.filePath), "tasks", `${name}.md`);
  writeNodeFile(filePath, renderFeatureTemplate(id, name, summary, dependsOn), "feature", opts.body);
  return { id, filePath };
}

function createTask(graph: Graph, opts: NewNodeOptions, summary: string): NewNodeResult {
  const parentId = requireParent(opts, "feature (ör. E01-F01)");
  const feature = requireNode(graph, parentId, "feature");
  const existingMax = maxNumber(graph, new RegExp(`^${esc(parentId)}-T(\\d{2})$`));
  const num = nextCounterValue(graph.rootDir, parentId, existingMax);
  const id = `${parentId}-T${pad(num)}`;
  const featureSegment = parentId.split("-").at(-1); // "E01-F01" → "F01"
  const name = `${featureSegment}-T${pad(num)}-${opts.slug}`;
  ensureNameFree(graph, name);
  const dependsOn = validateDependsOn(graph, opts.dependsOn, "task");
  const reads = validateReads(graph, opts.reads);
  const touches = opts.touches ?? [];
  const filePath = join(dirname(feature.filePath), `${name}.md`);
  writeNodeFile(
    filePath,
    renderTaskTemplate(id, name, summary, dependsOn, reads, touches, opts.task),
    "task",
    opts.body,
  );
  return { id, filePath };
}

function createKnowledge(graph: Graph, opts: NewNodeOptions, summary: string): NewNodeResult {
  ensureNameFree(graph, opts.slug); // knowledge'ta id = name = slug (SPEC §6)
  if (opts.shared) {
    const filePath = join(graph.rootDir, "_shared", "knowledge", `${opts.slug}.md`);
    writeNodeFile(filePath, renderKnowledgeTemplate(opts.slug, summary, "shared"), "knowledge", opts.body);
    return { id: opts.slug, filePath };
  }
  const parentId = requireParent(opts, "epic (ör. E01), ya da --shared kullan");
  const epic = requireNode(graph, parentId, "epic");
  const filePath = join(dirname(epic.filePath), "knowledge", `${opts.slug}.md`);
  writeNodeFile(filePath, renderKnowledgeTemplate(opts.slug, summary, "epic"), "knowledge", opts.body);
  return { id: opts.slug, filePath };
}

const SCHEMA_BY_KIND = {
  epic: EpicFrontmatterSchema,
  feature: FeatureFrontmatterSchema,
  task: TaskFrontmatterSchema,
  knowledge: KnowledgeFrontmatterSchema,
};

/**
 * Faz 14 B7 — yazmadan ÖNCE şemadan geçirir (ör. geçersiz `--complexity`), gövde
 * bölümlerini doldurur. Bozuk düğüm hiç diske düşmez — `gp set` ile aynı ilke.
 */
function writeNodeFile(
  filePath: string,
  content: string,
  kind: keyof typeof SCHEMA_BY_KIND,
  body: Record<string, string> | undefined,
): void {
  const parsed = SCHEMA_BY_KIND[kind].safeParse(matter(content).data);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new Error(`${issue?.path.join(".") ?? "frontmatter"}: ${issue?.message ?? "geçersiz"}`);
  }
  writeFileAtomic(filePath, body ? fillBody(content, body) : content);
}

export function fillBody(content: string, body: Record<string, string>): string {
  let out = content;
  for (const [section, text] of Object.entries(body)) {
    const placeholder = `## ${section}\n\n(TODO)\n`;
    const value = `## ${section}\n\n${text.trim()}\n`;
    if (out.includes(placeholder)) out = out.replace(placeholder, () => value);
    else out = `${out.replace(/\n*$/, "\n")}\n${value}`;
  }
  return out;
}

function maxNumber(graph: Graph, re: RegExp): number {
  let max = 0;
  for (const id of graph.nodesById.keys()) {
    const m = id.match(re);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function esc(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function requireParent(opts: NewNodeOptions, hint: string): string {
  if (!opts.parent) throw new Error(`--parent gerekli: ${hint}`);
  return opts.parent;
}

function requireNode(graph: Graph, id: string, kind: GraphNode["kind"]): GraphNode {
  const node = graph.nodesById.get(id);
  if (!node || node.kind !== kind) throw new Error(`parent bulunamadı veya ${kind} değil: ${id}`);
  return node;
}

function ensureNameFree(graph: Graph, name: string): void {
  if (graph.nodesByName.has(name)) throw new Error(`name zaten kullanılıyor: ${name}`);
}

function validateReads(graph: Graph, reads: string[] | undefined): string[] {
  if (!reads || reads.length === 0) return [];
  for (const name of reads) {
    const target = graph.nodesByName.get(name);
    if (!target || target.kind !== "knowledge") {
      throw new Error(`reads hedefi bulunamadı veya knowledge değil: ${name}`);
    }
  }
  return reads;
}

function validateDependsOn(
  graph: Graph,
  dependsOn: string[] | undefined,
  kind: GraphNode["kind"],
): string[] {
  if (!dependsOn || dependsOn.length === 0) return [];
  for (const depId of dependsOn) {
    const target = graph.nodesById.get(depId);
    if (!target || target.kind !== kind) {
      throw new Error(`depends_on hedefi bulunamadı veya ${kind} değil: ${depId}`);
    }
  }
  return dependsOn;
}
