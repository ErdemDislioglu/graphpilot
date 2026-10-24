import { dirname, join } from "node:path";
import { nextCounterValue } from "./counters.js";
import { writeFileAtomic } from "./atomicWrite.js";
import { renderEpicTemplate, renderFeatureTemplate, renderKnowledgeTemplate, renderTaskTemplate, } from "./templates.js";
const SLUG_RE = /^[a-z][a-z0-9-]*$/;
/**
 * SPEC/roadmap 2.10 — `gp new <kind> --parent <id> --slug <slug>`. Agent'lar yeni
 * düğümü elle yazmak yerine bunu çağırır; format hatası olmaz, ID asla çakışmaz/yeniden
 * kullanılmaz (`counters.ts`).
 */
export function createNewNode(graph, opts) {
    if (!SLUG_RE.test(opts.slug)) {
        throw new Error(`geçersiz slug: "${opts.slug}" (kebab-case olmalı, örn. search-api)`);
    }
    const summary = opts.summary ?? "(TODO özet)";
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
function createEpic(graph, opts, summary) {
    const existingMax = maxNumber(graph, /^E(\d{2})$/);
    const num = nextCounterValue(graph.rootDir, "E", existingMax);
    const id = `E${pad(num)}`;
    const name = `${id}-${opts.slug}`;
    ensureNameFree(graph, name);
    const dependsOn = validateDependsOn(graph, opts.dependsOn, "epic");
    const filePath = join(graph.rootDir, name, "epic.md");
    writeFileAtomic(filePath, renderEpicTemplate(id, name, summary, dependsOn));
    return { id, filePath };
}
function createFeature(graph, opts, summary) {
    const parentId = requireParent(opts, "epic (ör. E01)");
    const epic = requireNode(graph, parentId, "epic");
    const existingMax = maxNumber(graph, new RegExp(`^${esc(parentId)}-F(\\d{2})$`));
    const num = nextCounterValue(graph.rootDir, parentId, existingMax);
    const id = `${parentId}-F${pad(num)}`;
    const name = `F${pad(num)}-${opts.slug}`;
    ensureNameFree(graph, name);
    const dependsOn = validateDependsOn(graph, opts.dependsOn, "feature");
    const filePath = join(dirname(epic.filePath), "tasks", `${name}.md`);
    writeFileAtomic(filePath, renderFeatureTemplate(id, name, summary, dependsOn));
    return { id, filePath };
}
function createTask(graph, opts, summary) {
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
    writeFileAtomic(filePath, renderTaskTemplate(id, name, summary, dependsOn, reads, touches));
    return { id, filePath };
}
function createKnowledge(graph, opts, summary) {
    ensureNameFree(graph, opts.slug); // knowledge'ta id = name = slug (SPEC §6)
    if (opts.shared) {
        const filePath = join(graph.rootDir, "_shared", "knowledge", `${opts.slug}.md`);
        writeFileAtomic(filePath, renderKnowledgeTemplate(opts.slug, summary, "shared"));
        return { id: opts.slug, filePath };
    }
    const parentId = requireParent(opts, "epic (ör. E01), ya da --shared kullan");
    const epic = requireNode(graph, parentId, "epic");
    const filePath = join(dirname(epic.filePath), "knowledge", `${opts.slug}.md`);
    writeFileAtomic(filePath, renderKnowledgeTemplate(opts.slug, summary, "epic"));
    return { id: opts.slug, filePath };
}
function maxNumber(graph, re) {
    let max = 0;
    for (const id of graph.nodesById.keys()) {
        const m = id.match(re);
        if (m)
            max = Math.max(max, Number(m[1]));
    }
    return max;
}
function pad(n) {
    return String(n).padStart(2, "0");
}
function esc(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function requireParent(opts, hint) {
    if (!opts.parent)
        throw new Error(`--parent gerekli: ${hint}`);
    return opts.parent;
}
function requireNode(graph, id, kind) {
    const node = graph.nodesById.get(id);
    if (!node || node.kind !== kind)
        throw new Error(`parent bulunamadı veya ${kind} değil: ${id}`);
    return node;
}
function ensureNameFree(graph, name) {
    if (graph.nodesByName.has(name))
        throw new Error(`name zaten kullanılıyor: ${name}`);
}
function validateReads(graph, reads) {
    if (!reads || reads.length === 0)
        return [];
    for (const name of reads) {
        const target = graph.nodesByName.get(name);
        if (!target || target.kind !== "knowledge") {
            throw new Error(`reads hedefi bulunamadı veya knowledge değil: ${name}`);
        }
    }
    return reads;
}
function validateDependsOn(graph, dependsOn, kind) {
    if (!dependsOn || dependsOn.length === 0)
        return [];
    for (const depId of dependsOn) {
        const target = graph.nodesById.get(depId);
        if (!target || target.kind !== kind) {
            throw new Error(`depends_on hedefi bulunamadı veya ${kind} değil: ${depId}`);
        }
    }
    return dependsOn;
}
