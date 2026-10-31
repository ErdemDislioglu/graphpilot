import type { Config } from "./schema/index.js";
import type { GraphNode } from "./graph/types.js";

export interface RouteResult {
  model: string;
  agent: string;
  review: boolean;
  budget: number;
  max_turns: number;
}

/**
 * SPEC §10 — routing çözücü. Sadece `kind: task` düğümler için anlamlıdır.
 *
 * Öncelik: düğümde `model` elle verilmişse (≠ "auto") o kullanılır, routing tablosuna
 * hiç bakılmaz. Aksi halde `config.routing` kuralları sırayla denenir, ilk eşleşen kazanır.
 * Hiçbir kural eşleşmezse hata fırlatır (sessiz varsayılan yok — "model düşünür, script
 * çalışır" ilkesi: yapılandırma boşluğu gürültülü başarısız olmalı).
 */
export function resolveRoute(node: GraphNode, config: Config): RouteResult {
  if (node.kind !== "task") {
    throw new Error(`gp route sadece task düğümlerine uygulanır: ${node.id} bir ${node.kind}`);
  }
  const fm = node.frontmatter;

  const explicitModel = typeof fm.model === "string" && fm.model !== "auto" ? fm.model : null;
  let model: string;
  let review: boolean;
  if (explicitModel) {
    model = explicitModel;
    review = false;
  } else {
    const rule = config.routing.find((r) => matchesCondition(r.when, fm));
    if (!rule) {
      throw new Error(`${node.id} için eşleşen routing kuralı yok (config.yml'de catch-all eksik)`);
    }
    model = rule.model;
    review = rule.review;
  }

  const explicitAgent = typeof fm.agent === "string" && fm.agent !== "auto" ? fm.agent : null;
  const agent = explicitAgent ?? defaultAgentForType(fm.type);
  if (fm.type === "test") model = capTestModel(model, config);

  const budget =
    typeof fm.context_budget === "number" ? fm.context_budget : config.budgets.default_context;

  return { model, agent, review, budget, max_turns: config.budgets.max_turns };
}

/**
 * Faz 14 O2 — `type: test` görevi `efficiency.test_max_model`'in üstüne çıkmaz (ör.
 * `risk: high → opus` kuralı onu yakalasa bile). Sıra `config.escalation`'dan okunur;
 * modellerden biri listede yoksa sıralama belirsizdir, model olduğu gibi kalır.
 */
export function capTestModel(model: string, config: Config): string {
  const order = config.escalation as string[];
  const cap = config.efficiency.test_max_model;
  const idx = order.indexOf(model);
  const capIdx = order.indexOf(cap);
  if (idx === -1 || capIdx === -1) return model;
  return idx > capIdx ? cap : model;
}

type RoutingCondition = Config["routing"][number]["when"];

function matchesCondition(when: RoutingCondition, fm: Record<string, unknown>): boolean {
  for (const key of ["complexity", "risk", "type"] as const) {
    const want = when[key];
    if (want === undefined) continue;
    const actual = fm[key];
    const ok = Array.isArray(want) ? want.includes(actual as never) : want === actual;
    if (!ok) return false;
  }
  return true;
}

/**
 * Faz 2 eklemesi — SPEC/roadmap `agent: auto`'nun neye çözüleceğini tanımlamıyordu.
 * Tipe göre makul varsayılan: test → tester, docs → docs, diğerleri → coder.
 */
function defaultAgentForType(type: unknown): string {
  if (type === "test") return "tester";
  if (type === "docs") return "docs";
  return "coder";
}
