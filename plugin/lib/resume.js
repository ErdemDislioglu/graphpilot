import { computeStatusSummary } from "./status.js";
import { computeNext } from "./next.js";
import { extractSection } from "./markdown.js";
const MAX_ITEMS = 5;
/**
 * SPEC/roadmap 2.10b — `gp resume`: kesinti sonrası devam için ~500 token'lık özet.
 * Her liste en fazla `MAX_ITEMS` öğeyle sınırlanır (karakter bazlı kırpma değil —
 * markdown'ı ortadan bölüp bozmamak için liste uzunluğu sınırlanır). Ayrıntılar Faz 9.1'de.
 */
export function buildResumeSummary(graph) {
    const status = computeStatusSummary(graph);
    const next = computeNext(graph, { limit: MAX_ITEMS });
    const failed = [...graph.nodesById.values()]
        .filter((n) => n.frontmatter.status === "failed")
        .slice(0, MAX_ITEMS);
    const lines = ["# gp resume — nerede kaldık", "", "## Durum özeti", ""];
    for (const [key, count] of Object.entries(status.byStatus).sort()) {
        lines.push(`- ${key}: ${count}`);
    }
    lines.push("", "## Running kalmış düğümler", "");
    if (status.running.length === 0)
        lines.push("(yok)");
    for (const node of status.running.slice(0, MAX_ITEMS)) {
        lines.push(`- **${node.id}** — ${String(node.frontmatter.summary ?? "")}`);
        const wip = extractSection(node.body, "Yarım iş");
        if (wip)
            for (const l of wip.split("\n"))
                lines.push(`  > ${l}`);
    }
    lines.push("", "## Sıradaki hazır görevler", "");
    if (next.ready.length === 0)
        lines.push("(yok)");
    for (const node of next.ready) {
        lines.push(`- **${node.id}** — ${String(node.frontmatter.summary ?? "")}`);
    }
    lines.push("", "## Son başarısızlıklar", "");
    if (failed.length === 0)
        lines.push("(yok)");
    for (const node of failed) {
        const hataGecmisi = extractSection(node.body, "Hata geçmişi");
        const lastLine = hataGecmisi?.trim().split("\n").at(-1) ?? "(ayrıntı yok)";
        lines.push(`- **${node.id}** — ${lastLine}`);
    }
    return lines.join("\n") + "\n";
}
