/**
 * Genel topolojik sıralama + döngü tespiti. `validate.ts` (depends_on döngüsü) ve
 * `next.ts` (hazır düğüm hesaplama, tam sıra raporu) tarafından paylaşılır.
 *
 * Kahn algoritması: her adımda giren-derecesi 0 olan düğümleri alır. Sona kadar
 * tüketilemeyen düğümler varsa bunlar bir döngünün parçasıdır.
 */
export interface TopoResult {
  /** Bağımlılık sırasına uygun tam sıralama. Döngü varsa döngüdeki düğümler dahil değildir. */
  order: string[];
  /** Kahn algoritmasının tüketemediği düğümler — en az bir döngünün parçası. */
  cycleNodes: string[];
}

export function topoSort(nodeIds: string[], edges: Array<[string, string]>): TopoResult {
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();
  for (const id of nodeIds) {
    inDegree.set(id, 0);
    adj.set(id, []);
  }
  for (const [from, to] of edges) {
    // from -> to demek "from, to'ya bağımlı" (depends_on). Sıralamada to önce gelmeli.
    if (!adj.has(to) || !inDegree.has(from)) continue; // graph dışı referans; validate.ts'in işi
    adj.get(to)!.push(from);
    inDegree.set(from, (inDegree.get(from) ?? 0) + 1);
  }

  const queue = nodeIds.filter((id) => inDegree.get(id) === 0).sort();
  const order: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    order.push(id);
    const nextBatch: string[] = [];
    for (const dependent of adj.get(id) ?? []) {
      const deg = (inDegree.get(dependent) ?? 0) - 1;
      inDegree.set(dependent, deg);
      if (deg === 0) nextBatch.push(dependent);
    }
    queue.push(...nextBatch.sort());
  }

  const cycleNodes = nodeIds.filter((id) => !order.includes(id)).sort();
  return { order, cycleNodes };
}
