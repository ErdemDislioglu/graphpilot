import {
  EpicFrontmatterSchema,
  FeatureFrontmatterSchema,
  TaskFrontmatterSchema,
  KnowledgeFrontmatterSchema,
  ConfigSchema,
} from "./schema/index.js";
import { extractSection } from "./markdown.js";
import { estimateTokens } from "./tokens.js";
import { topoSort } from "./toposort.js";
import { buildContext } from "./context.js";
import { getChildren, tasksOf } from "./graph/types.js";
import type { Graph, GraphNode } from "./graph/types.js";

export interface ValidationIssue {
  file?: string;
  nodeId?: string;
  severity: "error" | "warning";
  message: string;
}

const HANDOFF_TOKEN_LIMIT = 300;
const BRIEF_TOKEN_LIMIT = 1500;
const MAX_TASKS_PER_FEATURE = 12;
/** SPEC/roadmap 5.5 — çok küçük görev heuristiği: Faz 7.5 gerçek birleştirmeyi tasarlayacak. */
const SMALL_TASK_MAX_TOUCHES = 1;

/**
 * SPEC'teki tüm kuralları kontrol eder (§3-§10). Sırasıyla:
 * parseErrors → frontmatter şeması → config.yml şeması → kırık link → kenar tip kontrolü
 * (depends_on sadece aynı kind, reads sadece knowledge) → döngü → token sınırları.
 */
export function validateGraph(graph: Graph): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const err of graph.parseErrors) {
    issues.push({ file: err.filePath, severity: "error", message: err.message });
  }

  const isDraft = new Map<string, boolean>();
  for (const node of graph.nodesById.values()) {
    const result = validateFrontmatter(node);
    if (!result.success) {
      for (const issue of result.issues) issues.push(issue);
    }
    isDraft.set(node.id, result.draft);
  }

  let validConfig: ReturnType<typeof ConfigSchema.parse> | null = null;
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
    } else {
      validConfig = configResult.data;
    }
  }

  for (const edge of graph.edges) {
    if (edge.type === "parent_of") continue; // structural, her zaman tutarlı
    const source = graph.nodesById.get(edge.from);
    if (!source) continue;

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
      } else if (target.kind !== source.kind) {
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
      } else if (target.kind !== "knowledge") {
        issues.push({
          file: source.filePath,
          nodeId: source.id,
          severity: "error",
          message: `reads sadece knowledge düğümüne işaret edebilir: [[${edge.to}]] bir ${target.kind}`,
        });
      }
    }
  }

  for (const kind of ["epic", "feature", "task"] as const) {
    const ids = [...graph.nodesById.values()].filter((n) => n.kind === kind).map((n) => n.id);
    const dependsOnEdges = graph.edges
      .filter((e) => e.type === "depends_on")
      .map((e) => [e.from, e.to] as [string, string])
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
        message: `brief.md ~${tokens} token, sınır ${BRIEF_TOKEN_LIMIT} (SPEC §7)`,
      });
    }
  }

  for (const node of graph.nodesById.values()) {
    if (node.kind !== "task" || node.frontmatter.status !== "done") continue;
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

    const smallSiblings = tasks.filter((t) => {
      const touches = Array.isArray(t.frontmatter.touches) ? t.frontmatter.touches : [];
      return (
        t.frontmatter.complexity === "low" &&
        t.frontmatter.type !== "test" &&
        touches.length <= SMALL_TASK_MAX_TOUCHES
      );
    });
    if (smallSiblings.length >= 2) {
      issues.push({
        file: feature.filePath,
        nodeId: feature.id,
        severity: "warning",
        message: `${smallSiblings.length} küçük görev birleştirme adayı (Faz 7.5): ${smallSiblings.map((t) => t.id).join(", ")}`,
      });
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
      } catch {
        // buildContext'in kendi hataları (örn. depends_on hedefi yok) zaten yukarıda raporlandı.
      }
    }
  }

  return issues;
}

function validateFrontmatter(
  node: GraphNode,
):
  | { success: true; draft: boolean }
  | { success: false; issues: ValidationIssue[]; draft: boolean } {
  const schema = {
    epic: EpicFrontmatterSchema,
    feature: FeatureFrontmatterSchema,
    task: TaskFrontmatterSchema,
    knowledge: KnowledgeFrontmatterSchema,
  }[node.kind];

  const result = schema.safeParse(node.frontmatter);
  if (result.success) {
    const draft =
      "draft" in result.data ? Boolean((result.data as { draft: boolean }).draft) : false;
    return { success: true, draft };
  }

  const draft = typeof node.frontmatter.draft === "boolean" ? node.frontmatter.draft : false;
  return {
    success: false,
    draft,
    issues: result.error.issues.map((issue) => ({
      file: node.filePath,
      nodeId: node.id,
      severity: "error" as const,
      message: `${issue.path.join(".")}: ${issue.message}`,
    })),
  };
}
