import { getDependsOn, tasksOf } from "./graph/types.js";
import { topoSort } from "./toposort.js";
export function computeNext(graph, opts = {}) {
    const tasks = tasksOf(graph);
    const taskIds = tasks.map((t) => t.id);
    const dependsOnEdges = graph.edges
        .filter((e) => e.type === "depends_on")
        .map((e) => [e.from, e.to])
        .filter(([from, to]) => taskIds.includes(from) && taskIds.includes(to));
    const { order: topoOrder, cycleNodes: cycles } = topoSort(taskIds, dependsOnEdges);
    const positionInTopo = new Map(topoOrder.map((id, i) => [id, i]));
    const ready = [];
    const blocked = [];
    for (const task of tasks) {
        if (task.frontmatter.status !== "pending")
            continue;
        const deps = getDependsOn(graph, task.id);
        const unmet = deps.filter((d) => d.frontmatter.status !== "done");
        if (unmet.length === 0)
            ready.push(task);
        else
            blocked.push({ node: task, waitingOn: unmet });
    }
    ready.sort((a, b) => (positionInTopo.get(a.id) ?? 0) - (positionInTopo.get(b.id) ?? 0));
    const limited = typeof opts.limit === "number" ? ready.slice(0, opts.limit) : ready;
    return {
        ready: limited,
        groups: groupByTouchesConflict(limited),
        blocked,
        topoOrder,
        cycles,
    };
}
/**
 * Greedy paketleme: her task'ı, `touches` çakışmadığı ilk gruba yerleştirir; yoksa
 * yeni grup açar. Çakışma tespiti kasıtlı olarak **muhafazakâr** (false positive'e
 * false negative'ten daha toleranslı) — glob kesişimi genel olarak zor bir problem;
 * gerçek bir çakışmayı kaçırmak veri yarışına yol açar, yanlışlıkla iki bağımsız
 * görevi sıralı çalıştırmak sadece küçük bir verimlilik kaybıdır.
 */
function groupByTouchesConflict(tasks) {
    const groups = [];
    for (const task of tasks) {
        const taskTouches = asStringArray(task.frontmatter.touches);
        const group = groups.find((g) => !g.some((other) => touchesConflict(taskTouches, asStringArray(other.frontmatter.touches))));
        if (group)
            group.push(task);
        else
            groups.push([task]);
    }
    return groups;
}
export function touchesConflict(a, b) {
    for (const pa of a) {
        const prefixA = literalPrefix(pa);
        for (const pb of b) {
            const prefixB = literalPrefix(pb);
            if (prefixA.startsWith(prefixB) || prefixB.startsWith(prefixA))
                return true;
        }
    }
    return false;
}
/** Glob karakterinden (`*?[`) önceki değişmez önek — basit ama muhafazakâr kesişim yaklaşımı. */
function literalPrefix(pattern) {
    const m = pattern.match(/^[^*?[\]]*/);
    return m ? m[0] : pattern;
}
function asStringArray(value) {
    return Array.isArray(value) ? value.filter((v) => typeof v === "string") : [];
}
