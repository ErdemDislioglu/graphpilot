import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import matter from "gray-matter";
import { parse as parseYaml } from "yaml";
import { NodeKindSchema } from "../schema/common.js";
import { extractWikilinks } from "./links.js";
import type { Edge, Graph, GraphNode, ParseError } from "./types.js";

/**
 * SPEC §1 — `.graph/` altındaki tüm md'leri okur, frontmatter + body ayırır,
 * `Graph` nesnesini (düğümler + kenarlar) kurar.
 *
 * Kasıtlı olarak Zod doğrulaması YAPMAZ — sadece `kind`'ın dört bilinen değerden biri
 * olup olmadığına bakar (dağıtım için gerekli minimum). Tam şema doğrulaması `validate.ts`'in
 * işi; parser bir dosya bozuksa tüm süreci düşürmez, `parseErrors`'a ekler ve devam eder.
 */
export function parseGraph(graphRootDir: string): Graph {
  if (!existsSync(graphRootDir) || !statSync(graphRootDir).isDirectory()) {
    throw new Error(`Graph kökü bulunamadı veya dizin değil: ${graphRootDir}`);
  }

  const parseErrors: ParseError[] = [];
  const nodesById = new Map<string, GraphNode>();
  const nodesByName = new Map<string, GraphNode>();

  const briefPath = join(graphRootDir, "brief.md");
  const briefBody = existsSync(briefPath)
    ? matter(readFileSync(briefPath, "utf-8")).content.trim()
    : null;

  const configPath = join(graphRootDir, "config.yml");
  let rawConfig: unknown = null;
  if (existsSync(configPath)) {
    try {
      rawConfig = parseYaml(readFileSync(configPath, "utf-8"));
    } catch (err) {
      parseErrors.push({
        filePath: configPath,
        message: `config.yml parse hatası: ${String(err)}`,
      });
    }
  }

  const mdFiles = listMarkdownFiles(graphRootDir).filter(
    (f) => f !== briefPath && !isGeneratedIndex(f),
  );

  for (const filePath of mdFiles) {
    const raw = readFileSync(filePath, "utf-8");
    let data: Record<string, unknown>;
    let content: string;
    try {
      const parsed = matter(raw);
      data = parsed.data as Record<string, unknown>;
      content = parsed.content.trim();
    } catch (err) {
      parseErrors.push({ filePath, message: `frontmatter parse hatası: ${String(err)}` });
      continue;
    }

    const kindResult = NodeKindSchema.safeParse(data.kind);
    if (!kindResult.success) {
      parseErrors.push({
        filePath,
        message: `bilinmeyen veya eksik 'kind': ${JSON.stringify(data.kind)}`,
      });
      continue;
    }
    const kind = kindResult.data;

    const id = typeof data.id === "string" ? data.id : null;
    const name = typeof data.name === "string" ? data.name : null;
    if (!id || !name) {
      parseErrors.push({ filePath, message: "id veya name alanı eksik/string değil" });
      continue;
    }

    if (nodesById.has(id)) {
      parseErrors.push({
        filePath,
        message: `tekrarlanan id: ${id} (önceki: ${nodesById.get(id)!.filePath})`,
      });
      continue;
    }
    if (nodesByName.has(name)) {
      parseErrors.push({
        filePath,
        message: `tekrarlanan name: ${name} (önceki: ${nodesByName.get(name)!.filePath})`,
      });
      continue;
    }

    const node: GraphNode = {
      id,
      kind,
      name,
      filePath,
      relPath: relative(graphRootDir, filePath).split(sep).join("/"),
      frontmatter: data,
      body: content,
      epicId: deriveEpicId(kind, id, filePath, graphRootDir),
    };

    nodesById.set(id, node);
    nodesByName.set(name, node);
  }

  const edges = buildEdges(nodesById);

  return {
    rootDir: graphRootDir,
    nodesById,
    nodesByName,
    edges,
    briefBody,
    rawConfig,
    configPath: existsSync(configPath) ? configPath : null,
    parseErrors,
  };
}

function listMarkdownFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listMarkdownFiles(full));
    else if (entry.name.endsWith(".md")) out.push(full);
  }
  return out;
}

/** `INDEX.md` / `_index.md` — otomatik üretilir, graph düğümü değildir (SPEC §9). */
function isGeneratedIndex(filePath: string): boolean {
  const base = filePath.split(sep).pop() ?? "";
  return base === "INDEX.md" || base === "_index.md";
}

/**
 * epic/feature/task: ID'nin kendisinden türetilir (`^E\d{2}`).
 * knowledge: `_shared/` altındaysa `null`; epic klasörü altındaysa o klasörün adından
 * (`E01-<slug>` biçimi) türetilir — knowledge ID'leri hiyerarşi kodlamadığı için ID'den
 * çıkarılamaz, dosya yoluna bakmak gerekir.
 */
function deriveEpicId(
  kind: GraphNode["kind"],
  id: string,
  filePath: string,
  graphRootDir: string,
): string | null {
  if (kind !== "knowledge") {
    const m = id.match(/^E\d{2}/);
    return m ? m[0] : null;
  }
  const relToRoot = relative(graphRootDir, filePath).split(sep);
  if (relToRoot[0] === "_shared") return null;
  const epicDirMatch = relToRoot[0]?.match(/^(E\d{2})-/);
  return epicDirMatch ? epicDirMatch[1] : null;
}

function buildEdges(nodesById: Map<string, GraphNode>): Edge[] {
  const edges: Edge[] = [];

  for (const node of nodesById.values()) {
    // depends_on — aynı türden düğümlere (task/feature/epic)
    const dependsOn = node.frontmatter.depends_on;
    if (Array.isArray(dependsOn)) {
      for (const target of dependsOn) {
        if (typeof target === "string")
          edges.push({ from: node.id, to: target, type: "depends_on" });
      }
    }

    // reads (frontmatter [[wikilink]] dizisi) + body prose'daki wikilink'ler — SPEC §8
    const readsNames = new Set<string>();
    const reads = node.frontmatter.reads;
    if (Array.isArray(reads)) {
      for (const entry of reads) {
        if (typeof entry === "string") for (const n of extractWikilinks(entry)) readsNames.add(n);
      }
    }
    for (const n of extractWikilinks(node.body)) readsNames.add(n);
    for (const name of readsNames) edges.push({ from: node.id, to: name, type: "reads" });

    // parent_of — ID hiyerarşisinden türetilir (epic→feature, feature→task)
    if (node.kind === "feature") {
      const parentId = node.id.split("-").slice(0, 1).join("-");
      if (nodesById.has(parentId)) edges.push({ from: parentId, to: node.id, type: "parent_of" });
    } else if (node.kind === "task") {
      const parentId = node.id.split("-").slice(0, 2).join("-");
      if (nodesById.has(parentId)) edges.push({ from: parentId, to: node.id, type: "parent_of" });
    }
  }

  // reads kenarlarının hedefi (name) yoksa bile kenar kaydedilir — kırık link tespiti
  // validate.ts'in işi. types.ts'teki getReads() çözülemeyen hedefleri zaten yoksayar.
  return edges;
}
