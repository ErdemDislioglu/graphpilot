import type { Config } from "./schema/index.js";
import type { GraphNode } from "./graph/types.js";
export interface LowNodeBatch {
    nodes: GraphNode[];
    model: string;
    agent: string;
    totalBudget: number;
}
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
export declare function computeLowComplexityBatches(readyTasks: GraphNode[], config: Config): {
    batches: LowNodeBatch[];
    singles: GraphNode[];
};
