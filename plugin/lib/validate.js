import { EpicFrontmatterSchema, FeatureFrontmatterSchema, TaskFrontmatterSchema, KnowledgeFrontmatterSchema, ConfigSchema, DEFAULT_EFFICIENCY, } from "./schema/index.js";
import { extractSection } from "./markdown.js";
import { estimateTokens } from "./tokens.js";
import { topoSort } from "./toposort.js";
import { buildContext } from "./context.js";
import { getChildren, tasksOf } from "./graph/types.js";
const HANDOFF_TOKEN_LIMIT = 300;
const BRIEF_TOKEN_LIMIT = 1500;
/** Roadmap 9.5 — bilgi düğümü için önerilen üst sınır (brief'ten gevşek, bkz. yorum). */
const KNOWLEDGE_TOKEN_LIMIT = 1200;
const MAX_TASKS_PER_FEATURE = 12;
/** SPEC/roadmap 5.5 — çok küçük görev heuristiği: Faz 7.5 gerçek birleştirmeyi tasarlayacak. */
const SMALL_TASK_MAX_TOUCHES = 1;
const RISK_ORDER = ["low", "med", "high"];
/** Faz 14 O2 — test dosyası desenleri: `src/test/`, `__tests__/`, `*Test.*`, `*.test.*`. */
const TEST_FILE_RE = /(^|\/)(src\/test|__tests__)\/|Test\.[^/]+$|\.test\.[^/]+$/;
/** "test edilebilir arayüz" O2'nin istediği kabul kriteridir — test isteği sayılmaz. */
const TESTABLE_RE = /test\s*edilebilir|testlenebilir|testable/gi;
const TEST_REQUEST_RE = /\btest/i;
/** Ayrı test görevi gerektiren uygulama tipleri (docs/config/scaffold/test hariç). */
const SEPARATE_TEST_TYPES = ["feature", "refactor", "fix"];
/** Yalnız henüz başlamamış görevler — açılmış eski graph'lar error'a düşmesin. */
const NOT_STARTED = ["pending", "ready"];
/**
 * SPEC'teki tüm kuralları kontrol eder (§3-§10). Sırasıyla:
 * parseErrors → frontmatter şeması → config.yml şeması → kırık link → kenar tip kontrolü
 * (depends_on sadece aynı kind, reads sadece knowledge) → döngü → token sınırları.
 */
export function validateGraph(graph) {
    const issues = [];
    for (const err of graph.parseErrors) {
        issues.push({ file: err.filePath, severity: "error", message: err.message });
    }
    const isDraft = new Map();
    for (const node of graph.nodesById.values()) {
        const result = validateFrontmatter(node);
        if (!result.success) {
            for (const issue of result.issues)
                issues.push(issue);
        }
        isDraft.set(node.id, result.draft);
    }
    let validConfig = null;
    if (graph.rawConfig !== null) {
        const configResult = ConfigSchema.safeParse(graph.rawConfig);
        if (!configResult.success) {
            for (const issue of configResult.error.issues) {
                issues.push({
                    file: graph.configPath ?? undefined,
                    severity: "error",
                    message: `config.yml: ${issue.path.join(".")}: ${issue.message}`,
                });
            }
        }
        else {
            validConfig = configResult.data;
        }
    }
    for (const edge of graph.edges) {
        if (edge.type === "parent_of")
            continue; // structural, her zaman tutarlı
        const source = graph.nodesById.get(edge.from);
        if (!source)
            continue;
        if (edge.type === "depends_on") {
            const target = graph.nodesById.get(edge.to);
            if (!target) {
                if (!isDraft.get(source.id)) {
                    issues.push({
                        file: source.filePath,
                        nodeId: source.id,
                        severity: "error",
                        message: `depends_on hedefi bulunamadı: ${edge.to}`,
                    });
                }
            }
            else if (target.kind !== source.kind) {
                issues.push({
                    file: source.filePath,
                    nodeId: source.id,
                    severity: "error",
                    message: `depends_on sadece aynı türe işaret edebilir: ${source.kind} → ${target.kind} (${edge.to})`,
                });
            }
        }
        if (edge.type === "reads") {
            const target = graph.nodesByName.get(edge.to);
            if (!target) {
                if (!isDraft.get(source.id)) {
                    issues.push({
                        file: source.filePath,
                        nodeId: source.id,
                        severity: "error",
                        message: `reads hedefi bulunamadı: [[${edge.to}]]`,
                    });
                }
            }
            else if (target.kind !== "knowledge") {
                issues.push({
                    file: source.filePath,
                    nodeId: source.id,
                    severity: "error",
                    message: `reads sadece knowledge düğümüne işaret edebilir: [[${edge.to}]] bir ${target.kind}`,
                });
            }
        }
    }
    for (const kind of ["epic", "feature", "task"]) {
        const ids = [...graph.nodesById.values()].filter((n) => n.kind === kind).map((n) => n.id);
        const dependsOnEdges = graph.edges
            .filter((e) => e.type === "depends_on")
            .map((e) => [e.from, e.to])
            .filter(([from, to]) => ids.includes(from) && ids.includes(to));
        const { cycleNodes } = topoSort(ids, dependsOnEdges);
        if (cycleNodes.length > 0) {
            issues.push({
                severity: "error",
                message: `depends_on döngüsü (${kind}): ${cycleNodes.join(" → ")}`,
            });
        }
    }
    if (graph.briefBody !== null) {
        const tokens = estimateTokens(graph.briefBody);
        if (tokens > BRIEF_TOKEN_LIMIT) {
            issues.push({
                severity: "warning",
                message: `brief.md ~${tokens} token, sınır ${BRIEF_TOKEN_LIMIT} (SPEC §7) — her task'ın bağlamına giriyor, özetlenmesi önerilir`,
            });
        }
    }
    // Roadmap 9.5 — "çok büyük bilgi düğümü → otomatik özetleme önerisi". Brief'ten farklı
    // olarak bilgi düğümleri sadece `reads` eden task'ların bağlamına girer (tüm graph'a
    // değil) — bu yüzden sınır daha gevşek (knowledge, Handoff gibi "özet" olması gereken
    // bir şey, ama brief kadar sık okunmaz).
    for (const node of graph.nodesById.values()) {
        if (node.kind !== "knowledge")
            continue;
        const tokens = estimateTokens(node.body);
        if (tokens > KNOWLEDGE_TOKEN_LIMIT) {
            issues.push({
                file: node.filePath,
                nodeId: node.id,
                severity: "warning",
                message: `bilgi düğümü ~${tokens} token, önerilen sınır ${KNOWLEDGE_TOKEN_LIMIT} — özetlenmesi önerilir (SPEC §6: "kod kopyalamaz, sadece imza/sözleşme")`,
            });
        }
    }
    for (const node of graph.nodesById.values()) {
        if (node.kind !== "task" || node.frontmatter.status !== "done")
            continue;
        const handoff = extractSection(node.body, "Handoff");
        if (handoff === null) {
            issues.push({
                file: node.filePath,
                nodeId: node.id,
                severity: "error",
                message: "status:done ama '## Handoff' bölümü yok",
            });
            continue;
        }
        const tokens = estimateTokens(handoff);
        if (tokens > HANDOFF_TOKEN_LIMIT) {
            issues.push({
                file: node.filePath,
                nodeId: node.id,
                severity: "warning",
                message: `Handoff ~${tokens} token, sınır ${HANDOFF_TOKEN_LIMIT} (SPEC §5a)`,
            });
        }
    }
    // SPEC/roadmap 5.5 — aşırı bölme / yetersiz bölme uyarıları (feature bazında).
    const features = [...graph.nodesById.values()].filter((n) => n.kind === "feature");
    for (const feature of features) {
        const tasks = getChildren(graph, feature.id).filter((n) => n.kind === "task");
        if (tasks.length > MAX_TASKS_PER_FEATURE) {
            issues.push({
                file: feature.filePath,
                nodeId: feature.id,
                severity: "warning",
                message: `feature ${tasks.length} görev içeriyor (sınır ${MAX_TASKS_PER_FEATURE}) — aşırı bölünmüş olabilir`,
            });
        }
        const small = tasks.filter((t) => {
            const touches = Array.isArray(t.frontmatter.touches) ? t.frontmatter.touches : [];
            return (t.frontmatter.complexity === "low" &&
                t.frontmatter.type !== "test" &&
                touches.length <= SMALL_TASK_MAX_TOUCHES);
        });
        // Faz 14 B14c — birbirine `depends_on` ile bağlı görevler aynı batch'e giremez
        // (`gp next`'in `batches`'ı da onları boş bırakır); uyarı da onları önermesin.
        const smallIds = new Set(small.map((t) => t.id));
        const linked = new Set();
        for (const t of small) {
            const deps = Array.isArray(t.frontmatter.depends_on) ? t.frontmatter.depends_on : [];
            for (const d of deps) {
                if (typeof d === "string" && smallIds.has(d)) {
                    linked.add(t.id);
                    linked.add(d);
                }
            }
        }
        const smallSiblings = small.filter((t) => !linked.has(t.id));
        if (smallSiblings.length >= 2) {
            issues.push({
                file: feature.filePath,
                nodeId: feature.id,
                severity: "warning",
                message: `${smallSiblings.length} küçük görev birleştirme adayı (Faz 7.5): ${smallSiblings.map((t) => t.id).join(", ")}`,
            });
        }
    }
    // Faz 14 O18 — doküman bütçesi: pilotta graph dokümanları (~82k karakter) kodun kendisinden
    // fazlaydı. Handoff hariç (kendi sınırı var, SPEC §5a); 0 = kontrol kapalı.
    if (validConfig) {
        const budget = validConfig.efficiency.doc_budget;
        const limits = {
            task: budget.task_body,
            feature: budget.feature_body,
            epic: budget.epic_body,
        };
        for (const node of graph.nodesById.values()) {
            const limit = limits[node.kind];
            if (!limit)
                continue;
            const handoff = node.kind === "task" ? extractSection(node.body, "Handoff") : null;
            const tokens = estimateTokens(handoff ? node.body.replace(handoff, "") : node.body);
            if (tokens > limit) {
                issues.push({
                    file: node.filePath,
                    nodeId: node.id,
                    severity: "warning",
                    message: `gövde ~${tokens} token, doküman bütçesi ${limit} (efficiency.doc_budget) — tekrar eden metni kısalt, arayüz/karar/kısıtı koru`,
                });
            }
        }
    }
    // context_budget tahmini aşan görev — gp context'in gerçek paket hesabını yeniden kullanır.
    if (validConfig) {
        for (const task of tasksOf(graph)) {
            try {
                const { overBudget, tokenEstimate, budget } = buildContext(graph, task.id, validConfig);
                if (overBudget) {
                    issues.push({
                        file: task.filePath,
                        nodeId: task.id,
                        severity: "warning",
                        message: `tahmini bağlam ~${tokenEstimate} token, context_budget ${budget}'ı aşıyor`,
                    });
                }
            }
            catch {
                // buildContext'in kendi hataları (örn. depends_on hedefi yok) zaten yukarıda raporlandı.
            }
        }
    }
    issues.push(...checkSeparateTests(graph, validConfig?.efficiency ?? DEFAULT_EFFICIENCY));
    return issues;
}
/**
 * Faz 14 O2 — risk ≥ `separate_test_min_risk` olan uygulama görevinin testleri ayrı
 * `type: test` görevine yazılır (pahalı model test yazmasın). Görev testi kendisi
 * üstleniyorsa (touches'ta test dosyası / kabul kriterinde test isteği) → warning;
 * ona `depends_on` eden bir test görevi yoksa → error (planner'a geri döner).
 */
function checkSeparateTests(graph, efficiency) {
    const issues = [];
    const minRisk = RISK_ORDER.indexOf(efficiency.separate_test_min_risk);
    const tasks = tasksOf(graph);
    for (const task of tasks) {
        const fm = task.frontmatter;
        if (fm.type === "test" || RISK_ORDER.indexOf(String(fm.risk)) < minRisk)
            continue;
        if (!NOT_STARTED.includes(String(fm.status)))
            continue;
        const touches = Array.isArray(fm.touches) ? fm.touches.filter((t) => typeof t === "string") : [];
        const testFiles = touches.filter((t) => TEST_FILE_RE.test(t));
        const criteria = (extractSection(task.body, "Kabul kriterleri") ?? "")
            .split("\n")
            .filter((line) => TEST_REQUEST_RE.test(line.replace(TESTABLE_RE, "")));
        if (testFiles.length > 0 || criteria.length > 0) {
            const why = testFiles.length > 0 ? `touches'ta test dosyası (${testFiles.join(", ")})` : "kabul kriteri test istiyor";
            issues.push({
                file: task.filePath,
                nodeId: task.id,
                severity: "warning",
                message: `risk ${String(fm.risk)} ≥ separate_test_min_risk ama ${why} — kabul kriteri "test edilebilir arayüz" olsun, testler ayrı type: test görevine (O2)`,
            });
        }
        if (!SEPARATE_TEST_TYPES.includes(String(fm.type)))
            continue;
        const hasTestTask = tasks.some((t) => t.frontmatter.type === "test" &&
            Array.isArray(t.frontmatter.depends_on) &&
            t.frontmatter.depends_on.includes(task.id));
        if (!hasTestTask) {
            issues.push({
                file: task.filePath,
                nodeId: task.id,
                severity: "error",
                message: `risk ${String(fm.risk)} ≥ separate_test_min_risk ama bu göreve depends_on eden type: test görevi yok (O2)`,
            });
        }
    }
    return issues;
}
function validateFrontmatter(node) {
    const schema = {
        epic: EpicFrontmatterSchema,
        feature: FeatureFrontmatterSchema,
        task: TaskFrontmatterSchema,
        knowledge: KnowledgeFrontmatterSchema,
    }[node.kind];
    const result = schema.safeParse(node.frontmatter);
    if (result.success) {
        const draft = "draft" in result.data ? Boolean(result.data.draft) : false;
        return { success: true, draft };
    }
    const draft = typeof node.frontmatter.draft === "boolean" ? node.frontmatter.draft : false;
    return {
        success: false,
        draft,
        issues: result.error.issues.map((issue) => ({
            file: node.filePath,
            nodeId: node.id,
            severity: "error",
            message: `${issue.path.join(".")}: ${issue.message}`,
        })),
    };
}
