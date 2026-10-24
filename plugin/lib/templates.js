/** `gp new`'in yazdığı iskelet dosya içerikleri — agent'lar format hatası yapmaz. */
function fm(obj) {
    const lines = Object.entries(obj).map(([k, v]) => `${k}: ${JSON.stringify(v)}`);
    return `---\n${lines.join("\n")}\n---\n`;
}
export function renderEpicTemplate(id, name, summary, dependsOn = []) {
    return (fm({
        id,
        kind: "epic",
        name,
        summary,
        status: "pending",
        expanded: false,
        depends_on: dependsOn,
        draft: false,
    }) + "\n## Amaç\n\n(TODO)\n\n## Kapsam\n\n(TODO)\n");
}
export function renderFeatureTemplate(id, name, summary, dependsOn = []) {
    return (fm({
        id,
        kind: "feature",
        name,
        summary,
        status: "pending",
        expanded: false,
        depends_on: dependsOn,
        draft: false,
    }) + "\n## Amaç\n\n(TODO)\n\n## Kabul kriterleri\n\n(TODO)\n");
}
export function renderTaskTemplate(id, name, summary, dependsOn = [], reads = [], touches = []) {
    return (fm({
        id,
        kind: "task",
        name,
        level: 3,
        summary,
        type: "feature",
        complexity: "med",
        risk: "low",
        context_size: "small",
        model: "auto",
        agent: "auto",
        depends_on: dependsOn,
        reads: reads.map((n) => `[[${n}]]`),
        touches,
        context_budget: 8000,
        status: "pending",
        attempts: 0,
        draft: false,
    }) +
        "\n## Görev\n\n(TODO)\n\n## Kabul kriterleri\n\n(TODO)\n\n## Handoff\n\n*(Henüz çalıştırılmadı.)*\n");
}
export function renderKnowledgeTemplate(id, summary, scope) {
    return (fm({ id, kind: "knowledge", name: id, summary, scope, updated_by: [], source_files: [] }) +
        "\n## Özet\n\n(TODO)\n\n## Arayüz\n\n(TODO)\n\n## Kararlar\n\n(TODO)\n\n## Dikkat\n\n(TODO)\n");
}
