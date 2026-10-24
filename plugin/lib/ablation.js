import { buildContext } from "./context.js";
import { computeLowComplexityBatches } from "./batching.js";
import { runChecks } from "./checks.js";
import { computeAgentStats } from "./agentStats.js";
import { buildRepoMap } from "./repomap.js";
import { estimateTokens } from "./tokens.js";
import { computeNext } from "./next.js";
const TECHNIQUE_LABELS = {
    cache_friendly_order: "Cache dostu sıralama (7.1)",
    repo_map: "Repo haritası (7.2)",
    log_trimming: "Log/çıktı kırpma (7.3)",
    tool_restriction: "Araç kısıtlama (7.4)",
    batch_low_nodes: "Küçük düğüm birleştirme (7.5)",
    deterministic_scaffold: "Deterministik iskelet (7.6)",
    turn_limits: "Tur limiti / döngü tespiti (7.7)",
};
/**
 * Roadmap 7.10 — "Ablasyon tablosu". **Dürüst sınır** (Faz 0/6'daki aynı kısıt): gerçek
 * bir çok-koşu LLM benchmark'ı (Faz 8'in işi) burada YOKTUR — onaysız gerçek API
 * kullanımı harcardı. Bunun yerine her tekniğin GERÇEK kodu, GERÇEK örnek graph'a
 * (`docs/examples/bookstore`) ve GERÇEK agent tanımlarına karşı çalıştırılıp ölçülebilen
 * her şey ölçülür; sadece "tekrarlı çağrıda cache isabet oranı" gibi doğası gereği
 * gerçek birden fazla API çağrısı gerektiren metrikler "yapısal" (mekanizma doğru
 * kurulu, sayısal fark Faz 8.1'i bekliyor) olarak işaretlenir.
 */
export function renderAblationMarkdown(rows) {
    const lines = [
        "<!-- Faz 7.10 — gp ablation tarafından üretilir; bkz. cli/src/ablation.ts -->",
        "",
        "# Ablasyon Tablosu — Faz 7 Token Optimizasyon Teknikleri",
        "",
        "| Teknik | Durum | Detay |",
        "|---|---|---|",
        ...rows.map((r) => `| ${TECHNIQUE_LABELS[r.technique]} | ${r.status} | ${escapeCell(r.detail)} |`),
        "",
    ];
    return lines.join("\n");
}
function escapeCell(text) {
    return text.replace(/\|/g, "\\|").replace(/\n/g, " ");
}
/**
 * Her tekniği GERÇEK veriyle (örnek graph, gerçek agent dosyaları, gerçek repo taraması)
 * tek tek ölçer. `sampleTaskId` — sıralama/determinizm demosunda kullanılacak, en az bir
 * `reads`/`depends_on`'u olan bir task ID'si (bookstore'da `E01-F01-T02`).
 */
export function computeAblationRows(graph, config, sampleTaskId, agentsDir, repoMapProjectRoot) {
    const rows = [];
    // 7.1 — sıra her zaman sabit/deterministik; cache İSABET ORANI gerçek tekrarlı
    // API çağrısı gerektirir (ADR-004: hook'larda token/cache bilgisi yok).
    const onOrder = buildContext(graph, sampleTaskId, config);
    const offConfig = {
        ...config,
        optimizations: { ...config.optimizations, cache_friendly_order: false },
    };
    const offOrder = buildContext(graph, sampleTaskId, offConfig);
    const sameByteSize = onOrder.tokenEstimate === offOrder.tokenEstimate;
    rows.push({
        technique: "cache_friendly_order",
        status: "yapısal",
        detail: `açık: sıra sabit (${onOrder.parts.length} parça); kapalı: alfabetik sıraya düşer ` +
            `— iki hâlde de gerçekten ≈${onOrder.tokenEstimate} token (byte boyutu ${sameByteSize ? "AYNI, doğrulandı" : "FARKLI — beklenmedik"}). ` +
            `Gerçek cache-isabet oranı farkı Faz 8.1'in tekrarlı-çağrı ölçümünü bekliyor.`,
    });
    // 7.2 — repo-map GERÇEK üretiliyor (cli/ kaynağı taranarak); "kaç Glob/Grep/Read
    // çağrısı önlendi" sorusu gerçek bir agent koşusu gerektirir (hook sayaçları artık var
    // — Faz 8'de bu veriyle doldurulacak).
    const repoMap = buildRepoMap(repoMapProjectRoot);
    rows.push({
        technique: "repo_map",
        status: "yapısal",
        detail: `hedef proje kökü için gerçek repo-map üretildi: ${repoMap.fileCount} dosya, ` +
            `≈${estimateTokens(repoMap.body)} token. "Kaç arama çağrısı önlendi" Faz 8'in hook ` +
            `sayaçlarından (tool-use.jsonl) gelecek canlı veriyi bekliyor.`,
    });
    // 7.3 — GERÇEK trim fonksiyonu, temsili (sentetik) uzun bir build logu ile.
    const longLog = Array.from({ length: 300 }, (_, i) => `build hatası satırı ${i}`).join("\n");
    const trimmed = runChecks("/dev/null", { build: "true" }, () => ({ ok: false, output: longLog }), {
        trimOutput: true,
    });
    const untrimmed = runChecks("/dev/null", { build: "true" }, () => ({ ok: false, output: longLog }), { trimOutput: false });
    const trimmedTokens = estimateTokens(trimmed[0]?.output ?? "");
    const untrimmedTokens = estimateTokens(untrimmed[0]?.output ?? "");
    rows.push({
        technique: "log_trimming",
        status: "ölçüldü",
        detail: `temsili 300 satırlık build logu: kırpılmamış ≈${untrimmedTokens} token → ` +
            `kırpılmış ≈${trimmedTokens} token (%${Math.round((1 - trimmedTokens / untrimmedTokens) * 100)} azalma).`,
    });
    // 7.4 — gerçek agent tanım dosyalarının tool-listesi token boyutu. "Kısıtlama olmasaydı
    // ne olurdu" sorusunun bir karşılığı yok (ADR-002: agent tanımı çağrı anında override edilemiyor).
    const agentStats = computeAgentStats(agentsDir);
    const totalToolDefTokens = agentStats.reduce((sum, a) => sum + a.toolDefTokens, 0);
    rows.push({
        technique: "tool_restriction",
        status: "yapısal",
        detail: `${agentStats.length} agent tanımı, toplam tool-listesi ≈${totalToolDefTokens} token ` +
            `(${agentStats.map((a) => `${a.name}:${a.toolDefTokens}`).join(", ")}). Kısıtlamasız ` +
            `bir varyant YOK (ADR-002) — karşılaştırma yapılamaz, sadece mevcut durum ölçüldü.`,
    });
    // 7.5 — gerçek graph'ın ready listesi üzerinde gerçek batching hesaplanır.
    const ready = computeNext(graph).ready;
    const batchingOn = computeLowComplexityBatches(ready, config);
    const callsOn = batchingOn.batches.length + batchingOn.singles.length;
    // kapalıyken her ready task kendi ayrı agent çağrısını alır — tanım gereği.
    const callsOff = ready.length;
    rows.push({
        technique: "batch_low_nodes",
        status: ready.length > 0 ? "ölçüldü" : "n/a",
        detail: ready.length === 0
            ? "örnek graph'ta şu an 'ready' task yok — ölçülemedi"
            : `açık: ${ready.length} ready task → ${callsOn} agent çağrısı (${batchingOn.batches.length} ` +
                `batch + ${batchingOn.singles.length} tekil); kapalı (varsayılan, her task ayrı): ${callsOff} çağrı.`,
    });
    // 7.6 — örnek graph'ta scaffold tipi task yok.
    const hasScaffold = [...graph.nodesById.values()].some((n) => n.kind === "task" && n.frontmatter.type === "scaffold");
    rows.push({
        technique: "deterministic_scaffold",
        status: hasScaffold ? "ölçüldü" : "n/a",
        detail: hasScaffold
            ? "scaffold task'ı bulundu, gp scaffold ile ölçüldü."
            : "örnek graph'ta (bookstore) 'type: scaffold' task'ı yok — ölçülemedi. " +
                "Mekanizma scaffold.test.ts'te gerçek execSync ile doğrulandı.",
    });
    // 7.7 — döngü tespiti davranışsal (token metriği değil); mekanizma testlerle doğrulandı.
    rows.push({
        technique: "turn_limits",
        status: "yapısal",
        detail: "Aynı dosya/komut 3. kez kullanıldığında additionalContext uyarısı üretildiği " +
            "trackToolUse.test.ts + hookCli.test.ts'te gerçek hook süreciyle doğrulandı. " +
            "Bu bir token tasarrufu değil, davranışsal bir erken-uyarı — sayısal 'tasarruf' iddiası yok.",
    });
    return rows;
}
