import { appendMetric, readMetrics } from "./metrics.js";
const FIX_LOOP_METRICS_FILE = "fix_loop.jsonl";
/** SPEC/roadmap 6.3 — her tur `_metrics`'e ayrı kayıt (tur no, eksik sayısı, token). */
export function recordFixLoopRound(graphRootDir, nodeId, round) {
    appendMetric(graphRootDir, FIX_LOOP_METRICS_FILE, {
        node: nodeId,
        ...round,
        ts: new Date().toISOString(),
    });
}
export function readFixLoopRounds(graphRootDir, nodeId) {
    return readMetrics(graphRootDir, FIX_LOOP_METRICS_FILE)
        .filter((r) => r.node === nodeId && typeof r.round === "number")
        .map((r) => ({
        round: r.round,
        issuesCount: r.issuesCount,
        tokens: r.tokens,
    }));
}
/**
 * SPEC/roadmap 6.3 "Frenler" — tur sınırı, yakınsama kontrolü, tur başına token bütçesi.
 * Saf fonksiyon: geçmiş turların listesini alır, "devam et mi, kır mı" kararını döner.
 * Orkestratör her turdan sonra bunu çağırır — kendi muhakemesine güvenmez (deterministik).
 */
export function computeFixLoopStatus(rounds, opts) {
    if (rounds.length === 0) {
        return { shouldBreak: false, reason: "henüz tur yok", converged: false, roundsUsed: 0 };
    }
    const last = rounds[rounds.length - 1];
    if (last.issuesCount === 0) {
        return {
            shouldBreak: true,
            reason: "yakınsadı (0 eksik)",
            converged: true,
            roundsUsed: rounds.length,
        };
    }
    if (rounds.length >= opts.maxRounds) {
        return {
            shouldBreak: true,
            reason: `tur sınırına ulaşıldı (${opts.maxRounds})`,
            converged: false,
            roundsUsed: rounds.length,
        };
    }
    if (opts.breakIfNoProgress && rounds.length >= 2) {
        const prev = rounds[rounds.length - 2];
        if (prev.issuesCount <= last.issuesCount) {
            return {
                shouldBreak: true,
                reason: "ilerleme yok (eksik sayısı azalmadı/arttı)",
                converged: false,
                roundsUsed: rounds.length,
            };
        }
    }
    if (opts.nodeBudget) {
        const totalTokens = rounds.reduce((sum, r) => sum + (r.tokens ?? 0), 0);
        if (totalTokens > opts.nodeBudget * 2) {
            return {
                shouldBreak: true,
                reason: `token bütçesinin 2 katı aşıldı (${totalTokens} > ${opts.nodeBudget * 2})`,
                converged: false,
                roundsUsed: rounds.length,
            };
        }
    }
    return { shouldBreak: false, reason: "devam et", converged: false, roundsUsed: rounds.length };
}
/**
 * Roadmap 7.8 — "Ölç: tur başına token, ilk tur ile sonraki turların oranı". Düşük oran
 * (sonraki turlar ilk turdan çok daha az token kullanıyor) doğrulama döngüsünün
 * "sadece eksik listesi gönder" ilkesinin (6.3) işe yaradığının kanıtıdır.
 */
export function computeFixLoopTokenRatio(rounds) {
    const firstRoundTokens = rounds[0]?.tokens ?? 0;
    const laterRoundsTokens = rounds.slice(1).reduce((sum, r) => sum + (r.tokens ?? 0), 0);
    return {
        firstRoundTokens,
        laterRoundsTokens,
        ratio: firstRoundTokens > 0 ? laterRoundsTokens / firstRoundTokens : null,
    };
}
/**
 * Faz 15 — escalate sonrası yeni model/rol tur sınırını baştan kullanabilsin diye işaret.
 * Eskiden sayaç sıfırlanmıyordu: 3 turu tüketmiş görev üst modele geçince ilk eksikte
 * yeniden yükseltiliyordu. `readFixLoopRounds` (ölçüm) işaretten etkilenmez.
 */
export function markFixLoopReset(graphRootDir, nodeId) {
    appendMetric(graphRootDir, FIX_LOOP_METRICS_FILE, { node: nodeId, reset: true, ts: new Date().toISOString() });
}
/** Son `markFixLoopReset`'ten sonraki turlar — fix-loop frenleri bunlara uygulanır. */
export function readCurrentAttemptRounds(graphRootDir, nodeId) {
    const rows = readMetrics(graphRootDir, FIX_LOOP_METRICS_FILE).filter((r) => r.node === nodeId);
    const lastReset = rows.map((r) => r.reset === true).lastIndexOf(true);
    return rows
        .slice(lastReset + 1)
        .filter((r) => typeof r.round === "number")
        .map((r) => ({
        round: r.round,
        issuesCount: r.issuesCount,
        tokens: r.tokens,
    }));
}
