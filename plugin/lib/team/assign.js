import { capTestModel } from "../route.js";
const ESCALATING_TAGS = ["architecture", "security", "data_model", "integration"];
function asStringArray(value) {
    return Array.isArray(value) ? value.filter((v) => typeof v === "string") : [];
}
function seniorAssignment(config) {
    return { role: "senior", model: config.team.senior.model, agent: "senior" };
}
function testerAssignment(config, explicitModel) {
    const model = capTestModel(explicitModel ?? config.team.tester.model, config);
    return { role: "tester", model, agent: "tester" };
}
function docsAssignment(config) {
    return { role: "docs", model: config.team.docs.model, agent: "docs" };
}
function juniorAssignment(config, tier, explicitModel) {
    return { role: "junior", model: explicitModel ?? config.team.junior[tier], agent: "coder" };
}
/**
 * Roadmap 13.3 — tag'e dayalı DETERMİNİSTİK atama tablosu. Sadece `config.team.enabled`
 * ise çağrılır (karar çağıranın işi — bu fonksiyon team modunun açık/kapalı olduğunu
 * BİLMEZ, saf bir eşleme). `assignee` alanı `auto` değilse tabloyu ELLE ezer (13.3).
 *
 * `resolveRoute`'un (route.ts) kuralıyla AYNI: `model` elle verilmişse (≠"auto") model
 * SEÇİMİNDE tablo/complexity'ye bakılmaz, o değer kullanılır — bu, `teamEscalate.ts`'in
 * "junior(haiku) → junior(sonnet)" gibi ARA basamakları yazdıktan sonra bir sonraki
 * `resolveAssignment` çağrısının o basamağı doğru okuması için gerekli (aksi halde her
 * çağrı complexity'den sıfırdan haiku'ya dönerdi).
 *
 * Satır ÖNCELİĞİ roadmap'in tablosunda açık değildi — şu sıra seçildi: `type: docs`/
 * `type: test` ROL olarak önce gelir (bir test görevi her zaman tester'a gider, ne kadar
 * karmaşık olursa olsun — tester kendi escalation zincirini 13.5'te kullanır); SONRA
 * karmaşıklık/risk tabanlı senior yükseltmesi; SONRA junior (complexity'ye göre model).
 */
export function resolveAssignment(node, config) {
    const fm = node.frontmatter;
    const explicitModel = typeof fm.model === "string" && fm.model !== "auto" ? fm.model : null;
    const assignee = typeof fm.assignee === "string" ? fm.assignee : "auto";
    if (assignee !== "auto") {
        switch (assignee) {
            case "senior":
                return seniorAssignment(config);
            case "tester":
                return testerAssignment(config, explicitModel);
            case "docs":
                return docsAssignment(config);
            case "junior":
                return juniorAssignment(config, fm.complexity === "med" ? "med" : "low", explicitModel);
        }
    }
    if (fm.type === "docs")
        return docsAssignment(config);
    if (fm.type === "test")
        return testerAssignment(config, explicitModel);
    const tags = asStringArray(fm.tags);
    const needsSenior = fm.complexity === "high" ||
        (fm.type === "refactor" && fm.context_size === "large") ||
        tags.some((t) => ESCALATING_TAGS.includes(t));
    if (needsSenior)
        return seniorAssignment(config);
    if (fm.complexity === "med")
        return juniorAssignment(config, "med", explicitModel);
    return juniorAssignment(config, "low", explicitModel);
}
/**
 * `route.ts`'in `resolveRoute`'una EŞDEĞER ama `config.routing` tablosuna HİÇ bakmayan
 * sürüm — ekip modu kendi atama mantığını (`config.team.*`) kullanır, `config.routing`'in
 * bir catch-all kuralı olmasına bağımlı olmamalı (kullanıcı ekip modunu açtığında routing
 * tablosunu boş/eksik bırakabilir). `autopilotLoop.ts`'in `config.team.enabled` ise
 * `resolveRoute` yerine bunu çağırması yeterli — yürütme motoru (Mod B) DEĞİŞMEDİ.
 */
export function resolveTeamRoute(node, config) {
    const assignment = resolveAssignment(node, config);
    const budget = typeof node.frontmatter.context_budget === "number"
        ? node.frontmatter.context_budget
        : config.budgets.default_context;
    return { model: assignment.model, agent: assignment.agent, review: false, budget, max_turns: config.budgets.max_turns };
}
