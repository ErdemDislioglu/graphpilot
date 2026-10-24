import { resolveRoute } from "./route.js";
const MAX_BATCH_SIZE = 4;
/**
 * Roadmap 7.5 — "Küçük düğümleri birleştirme". Aynı feature'daki (ID'nin ilk iki
 * parçası, ör. `E01-F01`), `complexity: low`, aynı modele/agent'a düşen task'ları tek
 * agent çağrısında birleştirmek için gruplar. `readyTasks` zaten `computeNext`'in
 * `ready` listesi olmalı — birbirine `depends_on` olan iki task aynı anda ready
 * olamaz, bu yüzden burada ayrıca bağımsızlık kontrolü yapılmaz.
 *
 * Üst sınır — **yorum kararı** (roadmap "toplam context_budget aşılmaz" diyor, hangi
 * değere göre belirtmiyor): batch'in toplam `context_budget`'ı `config.budgets.default_context`'i
 * aşamaz — yani bir batch, tek bir normal düğüm çağrısının tüketeceği kadar bağlam tüketir.
 * En fazla `MAX_BATCH_SIZE` (4) düğüm.
 */
export function computeLowComplexityBatches(readyTasks, config) {
    const batches = [];
    const singles = [];
    const budgetCap = config.budgets.default_context;
    const byFeature = new Map();
    for (const node of readyTasks) {
        if (node.frontmatter.complexity !== "low") {
            singles.push(node);
            continue;
        }
        const key = featureKeyOf(node.id);
        const list = byFeature.get(key) ?? [];
        list.push(node);
        byFeature.set(key, list);
    }
    for (const candidates of byFeature.values()) {
        const byRoute = new Map();
        for (const node of candidates) {
            let routeKey;
            try {
                const route = resolveRoute(node, config);
                routeKey = `${route.model}::${route.agent}`;
            }
            catch {
                singles.push(node);
                continue;
            }
            const list = byRoute.get(routeKey) ?? [];
            list.push(node);
            byRoute.set(routeKey, list);
        }
        for (const [routeKey, group] of byRoute) {
            const [model, agent] = routeKey.split("::");
            let current = [];
            let currentBudget = 0;
            const flush = () => {
                if (current.length === 0)
                    return;
                if (current.length === 1)
                    singles.push(current[0]);
                else
                    batches.push({ nodes: current, model, agent, totalBudget: currentBudget });
                current = [];
                currentBudget = 0;
            };
            for (const node of group) {
                const budget = nodeBudget(node, config);
                if (current.length >= MAX_BATCH_SIZE || currentBudget + budget > budgetCap) {
                    flush();
                }
                current.push(node);
                currentBudget += budget;
            }
            flush();
        }
    }
    return { batches, singles };
}
function nodeBudget(node, config) {
    return typeof node.frontmatter.context_budget === "number"
        ? node.frontmatter.context_budget
        : config.budgets.default_context;
}
/** Task ID'sinin ilk iki parçası (`E01-F01-T03` → `E01-F01`) — feature anahtarı. */
function featureKeyOf(taskId) {
    return taskId.split("-").slice(0, 2).join("-");
}
