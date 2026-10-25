import { readFileSync, rmSync } from "node:fs";
import { z } from "zod";
import { parseGraph } from "./graph/parser.js";
import { createNewNode } from "./newNode.js";
import { setFrontmatter } from "./set.js";
import { validateGraph } from "./validate.js";
import { writeFileAtomic } from "./atomicWrite.js";
import { ComplexitySchema, ContextSizeSchema, NodeKindSchema, RiskSchema, SummarySchema, TaskTypeSchema, } from "./schema/index.js";
const PlanNodeSchema = z
    .object({
    /** Plan içi takma ad — ID'ler yazılmadan bilinmediği için düğümler birbirine bununla bağlanır. */
    ref: z.string().min(1).optional(),
    kind: NodeKindSchema,
    slug: z.string().regex(/^[a-z][a-z0-9-]*$/, "slug kebab-case olmalı (örn. search-api)"),
    /** Var olan ID ya da plandaki önceki bir düğümün `ref`'i. */
    parent: z.string().min(1).optional(),
    shared: z.boolean().optional(),
    summary: SummarySchema,
    depends_on: z.array(z.string().min(1)).default([]),
    reads: z.array(z.string().min(1)).default([]),
    touches: z.array(z.string()).default([]),
    type: TaskTypeSchema.optional(),
    complexity: ComplexitySchema.optional(),
    risk: RiskSchema.optional(),
    context_size: ContextSizeSchema.optional(),
    tags: z.array(z.string().min(1)).optional(),
    verify: z.array(z.string().min(1)).optional(),
    body: z.record(z.string(), z.string()).optional(),
})
    .strict();
export const PlanSchema = z
    .object({
    nodes: z.array(PlanNodeSchema).min(1),
    /** Bu plan genişlettiği için `expanded: true` yapılacak epic/feature'lar (ID ya da ref). */
    expanded: z.array(z.string().min(1)).default([]),
})
    .strict();
const PARENT_KIND = {
    epic: null,
    feature: "epic",
    task: "feature",
    knowledge: "epic",
};
const TASK_ONLY = ["reads", "touches", "type", "complexity", "risk", "context_size", "tags", "verify"];
/**
 * Faz 14 O3 — `gp apply plan.json`. Planner tek bir JSON üretir (düğümler + frontmatter +
 * gövde); CLI hepsini doğrular, sonra yazar. Pilotta planner turlarının çoğu `gp new` →
 * Bash betiğiyle gövde yazma → `gp set summary/type/complexity` döngüsüydü (B4, B7) ve
 * "planner dosya yazmaz" kuralı Bash ile aşılıyordu.
 *
 * Akış: (1) plan şeması + ref/parent/depends_on/reads çözümü — hata varsa HİÇBİR dosya
 * yazılmaz; (2) düğümler sırayla `createNewNode` ile yazılır; (3) `expanded` işaretlenir;
 * (4) `validateGraph` yeni bir hata (ör. döngü) bulursa ya da yazma sırasında hata
 * çıkarsa oluşturulan dosyalar silinir, değiştirilenler geri yüklenir. ID sayaçları geri
 * alınmaz — ID'ler asla yeniden kullanılmaz (`counters.ts`).
 */
export function applyPlan(graphRoot, rawPlan, opts = {}) {
    const parsed = PlanSchema.safeParse(rawPlan);
    if (!parsed.success) {
        return {
            ok: false,
            errors: parsed.error.issues.map((i) => `plan.${i.path.join(".")}: ${i.message}`),
        };
    }
    const plan = parsed.data;
    const graph = parseGraph(graphRoot);
    const errors = checkPlan(graph, plan);
    if (errors.length > 0)
        return { ok: false, errors };
    if (opts.dryRun)
        return { ok: true, dryRun: true, created: [], expanded: [] };
    const before = errorKeys(graph);
    const created = [];
    const backups = new Map();
    const refToId = new Map();
    const resolve = (v) => refToId.get(v) ?? v;
    try {
        for (const node of plan.nodes) {
            const result = createNewNode(parseGraph(graphRoot), {
                kind: node.kind,
                slug: node.slug,
                parent: node.parent ? resolve(node.parent) : undefined,
                summary: node.summary,
                shared: node.shared,
                dependsOn: node.depends_on.map(resolve),
                reads: node.kind === "task" ? node.reads.map(stripWikilink) : undefined,
                touches: node.kind === "task" ? node.touches : undefined,
                task: node.kind === "task"
                    ? {
                        type: node.type,
                        complexity: node.complexity,
                        risk: node.risk,
                        context_size: node.context_size,
                        tags: node.tags,
                        verify: node.verify,
                    }
                    : undefined,
                body: node.body,
            });
            created.push({ ...(node.ref ? { ref: node.ref } : {}), id: result.id, filePath: result.filePath });
            if (node.ref)
                refToId.set(node.ref, result.id);
        }
        const expanded = plan.expanded.map(resolve);
        for (const id of expanded) {
            const current = parseGraph(graphRoot);
            const target = current.nodesById.get(id);
            if (!backups.has(target.filePath))
                backups.set(target.filePath, readFileSync(target.filePath, "utf-8"));
            const res = setFrontmatter(current, id, { expanded: "true" });
            if (!res.ok)
                throw new Error(`${id}: ${res.errors.join("; ")}`);
        }
        const after = validateGraph(parseGraph(graphRoot)).filter((i) => i.severity === "error");
        const introduced = after.filter((i) => !before.has(issueKey(i)));
        if (introduced.length > 0) {
            throw new Error(introduced.map((i) => `${i.nodeId ?? i.file ?? "-"}: ${i.message}`).join("\n"));
        }
        return { ok: true, dryRun: false, created, expanded };
    }
    catch (err) {
        for (const node of created)
            rmSync(node.filePath, { force: true });
        for (const [filePath, content] of backups)
            writeFileAtomic(filePath, content);
        return {
            ok: false,
            errors: [`uygulanamadı, geri alındı: ${err instanceof Error ? err.message : String(err)}`],
        };
    }
}
/** Yazmadan önce: ref'ler tekil mi, parent/depends_on/reads/expanded çözülüyor mu, türler doğru mu. */
function checkPlan(graph, plan) {
    const errors = [];
    const refKinds = new Map();
    const plannedKnowledge = new Set();
    const kindOf = (v) => refKinds.get(v) ?? graph.nodesById.get(v)?.kind;
    plan.nodes.forEach((node, i) => {
        const at = `plan.nodes.${i}${node.ref ? ` (${node.ref})` : ""}`;
        if (node.ref) {
            if (refKinds.has(node.ref) || graph.nodesById.has(node.ref)) {
                errors.push(`${at}: ref tekil olmalı ve var olan bir ID ile çakışmamalı: ${node.ref}`);
            }
        }
        const parentKind = PARENT_KIND[node.kind];
        if (node.kind === "knowledge" && node.shared) {
            if (node.parent)
                errors.push(`${at}: shared knowledge parent almaz`);
        }
        else if (parentKind) {
            if (!node.parent)
                errors.push(`${at}: parent gerekli (${parentKind})`);
            else if (kindOf(node.parent) !== parentKind) {
                errors.push(`${at}: parent bulunamadı veya ${parentKind} değil: ${node.parent}`);
            }
        }
        else if (node.parent) {
            errors.push(`${at}: epic parent almaz`);
        }
        const depKind = node.kind === "knowledge" ? null : node.kind;
        for (const dep of node.depends_on) {
            if (!depKind)
                errors.push(`${at}: knowledge depends_on almaz`);
            else if (kindOf(dep) !== depKind) {
                errors.push(`${at}: depends_on hedefi bulunamadı veya ${depKind} değil: ${dep}`);
            }
        }
        if (node.kind !== "task") {
            for (const field of TASK_ONLY) {
                const value = node[field];
                if (value !== undefined && !(Array.isArray(value) && value.length === 0)) {
                    errors.push(`${at}: '${field}' yalnız task için`);
                }
            }
        }
        else {
            for (const read of node.reads.map(stripWikilink)) {
                const existing = graph.nodesByName.get(read);
                if (!plannedKnowledge.has(read) && existing?.kind !== "knowledge") {
                    errors.push(`${at}: reads hedefi bulunamadı veya knowledge değil: ${read}`);
                }
            }
        }
        if (node.ref)
            refKinds.set(node.ref, node.kind);
        if (node.kind === "knowledge")
            plannedKnowledge.add(node.slug);
    });
    for (const id of plan.expanded) {
        const kind = kindOf(id);
        if (kind !== "epic" && kind !== "feature") {
            errors.push(`plan.expanded: bulunamadı veya epic/feature değil: ${id}`);
        }
    }
    return errors;
}
function stripWikilink(v) {
    const m = /^\[\[(.+)\]\]$/.exec(v);
    return m ? m[1] : v;
}
function issueKey(i) {
    return `${i.nodeId ?? i.file ?? ""}::${i.message}`;
}
function errorKeys(graph) {
    return new Set(validateGraph(graph)
        .filter((i) => i.severity === "error")
        .map(issueKey));
}
