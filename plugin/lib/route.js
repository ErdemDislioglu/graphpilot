/**
 * SPEC §10 — routing çözücü. Sadece `kind: task` düğümler için anlamlıdır.
 *
 * Öncelik: düğümde `model` elle verilmişse (≠ "auto") o kullanılır, routing tablosuna
 * hiç bakılmaz. Aksi halde `config.routing` kuralları sırayla denenir, ilk eşleşen kazanır.
 * Hiçbir kural eşleşmezse hata fırlatır (sessiz varsayılan yok — "model düşünür, script
 * çalışır" ilkesi: yapılandırma boşluğu gürültülü başarısız olmalı).
 */
export function resolveRoute(node, config) {
    if (node.kind !== "task") {
        throw new Error(`gp route sadece task düğümlerine uygulanır: ${node.id} bir ${node.kind}`);
    }
    const fm = node.frontmatter;
    const explicitModel = typeof fm.model === "string" && fm.model !== "auto" ? fm.model : null;
    let model;
    let review;
    if (explicitModel) {
        model = explicitModel;
        review = false;
    }
    else {
        const rule = config.routing.find((r) => matchesCondition(r.when, fm));
        if (!rule) {
            throw new Error(`${node.id} için eşleşen routing kuralı yok (config.yml'de catch-all eksik)`);
        }
        model = rule.model;
        review = rule.review;
    }
    const explicitAgent = typeof fm.agent === "string" && fm.agent !== "auto" ? fm.agent : null;
    const agent = explicitAgent ?? defaultAgentForType(fm.type);
    const budget = typeof fm.context_budget === "number" ? fm.context_budget : config.budgets.default_context;
    return { model, agent, review, budget, max_turns: config.budgets.max_turns };
}
function matchesCondition(when, fm) {
    for (const key of ["complexity", "risk", "type"]) {
        const want = when[key];
        if (want === undefined)
            continue;
        const actual = fm[key];
        const ok = Array.isArray(want) ? want.includes(actual) : want === actual;
        if (!ok)
            return false;
    }
    return true;
}
/**
 * Faz 2 eklemesi — SPEC/roadmap `agent: auto`'nun neye çözüleceğini tanımlamıyordu.
 * Tipe göre makul varsayılan: test → tester, docs → docs, diğerleri → coder.
 */
function defaultAgentForType(type) {
    if (type === "test")
        return "tester";
    if (type === "docs")
        return "docs";
    return "coder";
}
