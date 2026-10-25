import { describe, expect, it } from "vitest";
import {
  checkoutBranch,
  commitAll,
  epicBranchName,
  epicsListText,
  expandCandidateInScope,
  expansionPrompt,
  helpText,
  inScope,
  parseRunTarget,
  pushCurrentBranch,
  scopeDone,
} from "../autopilot/epicRun.js";
import type { GitRunner } from "../check.js";
import { ConfigSchema } from "../schema/index.js";
import { withTempGraph } from "../testUtils/tempGraph.js";

const node = (fm: Record<string, unknown>): string =>
  `---\n${Object.entries(fm)
    .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
    .join("\n")}\n---\n`;

const EPIC = (id: string, extra: Record<string, unknown> = {}) =>
  node({
    id,
    kind: "epic",
    name: `${id}-ornek`,
    summary: `${id} özeti`,
    status: "pending",
    expanded: false,
    depends_on: [],
    ...extra,
  });
const FEATURE = (id: string, extra: Record<string, unknown> = {}) =>
  node({
    id,
    kind: "feature",
    name: `${id}-f`,
    summary: "f",
    status: "pending",
    expanded: true,
    depends_on: [],
    ...extra,
  });
const TASK = (id: string, status: string) =>
  node({
    id,
    kind: "task",
    name: `${id}-t`,
    level: 3,
    summary: "t",
    type: "feature",
    complexity: "low",
    risk: "low",
    context_size: "small",
    model: "auto",
    agent: "auto",
    depends_on: [],
    context_budget: 8000,
    status,
    attempts: 0,
  });

/** E01 bitmiş (1/1), E02 yarım (1/2), E03 hiç açılmamış. */
const FILES = {
  "e1.md": EPIC("E01", { expanded: true }),
  "f1.md": FEATURE("E01-F01"),
  "t1.md": TASK("E01-F01-T01", "done"),
  "e2.md": EPIC("E02", { expanded: true }),
  "f2.md": FEATURE("E02-F01"),
  "t2.md": TASK("E02-F01-T01", "done"),
  "t3.md": TASK("E02-F01-T02", "pending"),
  "e3.md": EPIC("E03"),
};

function fakeGit(responses: Record<string, { stdout?: string; status: number }> = {}) {
  const calls: string[] = [];
  const git: GitRunner = (args) => {
    const key = args.join(" ");
    calls.push(key);
    const r =
      responses[key] ??
      (key === "rev-parse --is-inside-work-tree" ? { stdout: "true\n", status: 0 } : { status: 0 });
    return { stdout: r.stdout ?? "", status: r.status };
  };
  return { git, calls };
}

describe("inScope", () => {
  it("all / epic: / until: kapsamlarını epic ID'sine göre uygular", () => {
    withTempGraph(FILES, (graph) => {
      const t = graph.nodesById.get("E02-F01-T02")!;
      expect(inScope(t, "all")).toBe(true);
      expect(inScope(t, "epic:E02")).toBe(true);
      expect(inScope(t, "epic:E03")).toBe(false);
      expect(inScope(t, "until:E02")).toBe(true);
      expect(inScope(t, "until:E01")).toBe(false);
      expect(inScope(graph.nodesById.get("E03")!, "epic:E03")).toBe(true);
    });
  });
});

describe("expandCandidateInScope / scopeDone", () => {
  it("yalnız kapsamdaki açılmamış epic'i aday verir; bitmiş epic kapsamını done sayar", () => {
    withTempGraph(FILES, (graph) => {
      expect(expandCandidateInScope(graph, "epic:E03")).toEqual({ id: "E03", kind: "epic" });
      expect(expandCandidateInScope(graph, "epic:E02")).toBeUndefined();
      expect(scopeDone(graph, "epic:E01")).toBe(true);
      expect(scopeDone(graph, "epic:E02")).toBe(false);
      expect(scopeDone(graph, "epic:E03")).toBe(false);
      expect(scopeDone(graph, "epic:E99")).toBe(false);
    });
  });
});

describe("parseRunTarget", () => {
  it("küçük harfli ID'yi kabul eder, eksik/bilinmeyen/bitmiş epic'i reddeder", () => {
    withTempGraph(FILES, (graph) => {
      const ok = parseRunTarget(graph, "e03", "tr");
      expect(ok.ok && ok.epic.id).toBe("E03");
      expect(parseRunTarget(graph, "", "tr")).toEqual({ ok: false, error: "Kullanım: /run E03" });
      expect(parseRunTarget(graph, "E99", "tr").ok).toBe(false);
      expect(parseRunTarget(graph, "E01-F01", "tr").ok).toBe(false);
      expect(parseRunTarget(graph, "E01", "tr")).toEqual({
        ok: false,
        error: "E01 zaten tamamlandı.",
      });
    });
  });
});

describe("epicsListText / helpText", () => {
  it("her epic için durum işareti ve ilerleme sayısı gösterir", () => {
    withTempGraph(FILES, (graph) => {
      expect(epicsListText(graph, "tr").split("\n")).toEqual([
        "📚 Epic'ler:",
        "✅ E01 (1/1) — E01 özeti",
        "⏳ E02 (1/2) — E02 özeti",
        "▫️ E03 — E03 özeti",
      ]);
    });
  });

  it("yardım metni /run komutunu anlatır", () => {
    expect(helpText("tr")).toContain("/run E03");
    expect(helpText("en")).toContain("/run E03");
  });
});

describe("expansionPrompt", () => {
  it("epic için GENİŞLETME-FEATURE, feature için GENİŞLETME-TASK modu ve gp yolu verir", () => {
    const config = ConfigSchema.parse({
      routing: [{ when: {}, model: "haiku" }],
      escalation: ["haiku"],
      max_attempts_per_model: 1,
      budgets: { default_context: 8000, max_turns: 25 },
    });
    const epic = expansionPrompt({ id: "E03", kind: "epic" }, config, "/p");
    expect(epic.split("\n").slice(0, 2)).toEqual(["MOD: GENİŞLETME-FEATURE", "Hedef: E03"]);
    expect(epic).toContain('gp = node "/p/lib/bin.js"');
    expect(expansionPrompt({ id: "E03-F01", kind: "feature" }, config, "/p")).toMatch(
      /^MOD: GENİŞLETME-TASK/,
    );
  });
});

describe("epicBranchName", () => {
  it("ID ile başlayan adı tekrar etmez, başlamayana ID ekler", () => {
    withTempGraph(FILES, (graph) => {
      expect(epicBranchName(graph.nodesById.get("E03")!)).toBe("feature/E03-ornek");
      expect(epicBranchName({ ...graph.nodesById.get("E03")!, name: "el cizimi" })).toBe(
        "feature/E03-el-cizimi",
      );
    });
  });
});

describe("git yardımcıları", () => {
  it("commitAll: değişiklik varsa add + commit, yoksa commit atmaz", () => {
    const changed = fakeGit({ "diff --cached --quiet": { status: 1 } });
    expect(commitAll("/r", "gp(X): y", changed.git)).toBe(true);
    expect(changed.calls).toContain("commit -q -m gp(X): y");

    const clean = fakeGit({ "diff --cached --quiet": { status: 0 } });
    expect(commitAll("/r", "m", clean.git)).toBe(false);
    expect(clean.calls.some((c) => c.startsWith("commit"))).toBe(false);
  });

  it("git deposu değilse hiçbir şey yapmaz", () => {
    const none = fakeGit({ "rev-parse --is-inside-work-tree": { status: 128 } });
    expect(commitAll("/r", "m", none.git)).toBe(false);
    expect(checkoutBranch("/r", "feature/x", none.git)).toBe(false);
    expect(pushCurrentBranch("/r", none.git)).toBe(false);
    expect(none.calls).toEqual(Array(3).fill("rev-parse --is-inside-work-tree"));
  });

  it("checkoutBranch: zaten o daldaysa dokunmaz, yoksa önce checkout sonra -b dener", () => {
    const same = fakeGit({ "rev-parse --abbrev-ref HEAD": { stdout: "feature/x\n", status: 0 } });
    expect(checkoutBranch("/r", "feature/x", same.git)).toBe(true);
    expect(same.calls.some((c) => c.startsWith("checkout"))).toBe(false);

    const fresh = fakeGit({
      "rev-parse --abbrev-ref HEAD": { stdout: "main\n", status: 0 },
      "checkout -q feature/x": { status: 1 },
    });
    expect(checkoutBranch("/r", "feature/x", fresh.git)).toBe(true);
    expect(fresh.calls.at(-1)).toBe("checkout -q -b feature/x");
  });

  it("pushCurrentBranch: origin'e upstream ile push'lar ve sonucu döner", () => {
    const ok = fakeGit();
    expect(pushCurrentBranch("/r", ok.git)).toBe(true);
    expect(ok.calls.at(-1)).toBe("push -q -u origin HEAD");
    expect(pushCurrentBranch("/r", fakeGit({ "push -q -u origin HEAD": { status: 1 } }).git)).toBe(
      false,
    );
  });
});
