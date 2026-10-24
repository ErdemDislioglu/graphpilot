import { ConfigSchema } from "./schema/index.js";
import { resolveRoute } from "./route.js";
import { tasksOf } from "./graph/types.js";
const BANNER = "<!-- OTOMATİK ÜRETİLİR — ELLE DÜZENLEME (gp index) -->";
/**
 * SPEC §9 — `INDEX.md`/`_index.md` üretimi. **Deterministik olmalı**: aynı graph
 * her zaman aynı byte dizisini üretir (tarih, rastgelelik, Map iterasyon sırasına
 * güven YOK — her yerde açık `.sort()`).
 */
export function generateRootIndex(graph) {
    const epics = [...graph.nodesById.values()]
        .filter((n) => n.kind === "epic")
        .sort((a, b) => a.id.localeCompare(b.id));
    const lines = [BANNER, "", "# GraphPilot — INDEX", ""];
    if (graph.briefBody !== null) {
        lines.push("## Brief", "", graph.briefBody, "");
    }
    lines.push("## Epic'ler", "", "| id | tür | özet | durum | ilerleme % |", "|---|---|---|---|---|");
    for (const epic of epics) {
        const tasks = tasksOf(graph).filter((t) => t.epicId === epic.id);
        const progress = formatProgress(tasks);
        lines.push(`| ${epic.id} | epic | ${escapeCell(String(epic.frontmatter.summary ?? ""))} | ${String(epic.frontmatter.status ?? "")} | ${progress} |`);
    }
    lines.push("");
    return lines.join("\n");
}
export function generateEpicIndex(graph, epicId) {
    const epic = graph.nodesById.get(epicId);
    const configResult = ConfigSchema.safeParse(graph.rawConfig);
    const config = configResult.success ? configResult.data : null;
    const kindOrder = {
        feature: 0,
        task: 1,
        knowledge: 2,
        epic: -1,
    };
    const rows = [...graph.nodesById.values()]
        .filter((n) => n.epicId === epicId && n.kind !== "epic")
        .sort((a, b) => kindOrder[a.kind] - kindOrder[b.kind] || a.id.localeCompare(b.id));
    const lines = [
        BANNER,
        "",
        `# ${epicId} — ${epic ? String(epic.frontmatter.summary ?? "") : "(epic bulunamadı)"}`,
        "",
        "| id | tür | özet | durum | model |",
        "|---|---|---|---|---|",
    ];
    for (const node of rows) {
        const model = node.kind === "task" && config ? safeRouteModel(node, config) : "–";
        lines.push(`| ${node.id} | ${node.kind} | ${escapeCell(String(node.frontmatter.summary ?? ""))} | ${String(node.frontmatter.status ?? "")} | ${model} |`);
    }
    lines.push("");
    return lines.join("\n");
}
function safeRouteModel(node, config) {
    try {
        return resolveRoute(node, config).model;
    }
    catch {
        return "?";
    }
}
function formatProgress(tasks) {
    if (tasks.length === 0)
        return "–";
    const done = tasks.filter((t) => t.frontmatter.status === "done").length;
    return `${Math.round((done / tasks.length) * 100)}%`;
}
function escapeCell(text) {
    return text.replace(/\|/g, "\\|");
}
