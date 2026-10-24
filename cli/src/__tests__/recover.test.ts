import { describe, expect, it } from "vitest";
import { decideRunningNodeRecovery, findOrphanWipCommits } from "../recover.js";
import type { GraphNode } from "../graph/types.js";

function node(body: string): GraphNode {
  return {
    id: "E01-F01-T01",
    kind: "task",
    name: "t",
    filePath: "/tmp/t.md",
    relPath: "t.md",
    epicId: "E01",
    frontmatter: { status: "running" },
    body,
  };
}

describe("decideRunningNodeRecovery", () => {
  it("gerçek içerikli '## Yarım iş' notu varsa resume", () => {
    const result = decideRunningNodeRecovery(
      node("## Görev\nx\n\n## Yarım iş\n\nstore.js bitti, server.js'in PATCH kolu kaldı.\n"),
    );
    expect(result).toEqual({
      nodeId: "E01-F01-T01",
      action: "resume",
      reason: "## Yarım iş notu var — kaldığı yerden devam edecek",
    });
  });

  it("'## Yarım iş' bölümü hiç yoksa revert", () => {
    const result = decideRunningNodeRecovery(node("## Görev\nx\n"));
    expect(result.action).toBe("revert");
  });

  it("'## Yarım iş' bölümü var ama sadece placeholder ise revert", () => {
    const result = decideRunningNodeRecovery(node("## Görev\nx\n\n## Yarım iş\n\n*(Henüz çalıştırılmadı.)*\n"));
    expect(result.action).toBe("revert");
  });

  it("'## Yarım iş' bölümü var ama boşsa revert", () => {
    const result = decideRunningNodeRecovery(node("## Görev\nx\n\n## Yarım iş\n\n"));
    expect(result.action).toBe("revert");
  });
});

describe("findOrphanWipCommits", () => {
  it("resumingNodeIds içinde OLMAYAN bir düğümün WIP commit'ini yetim sayar", () => {
    const subjects = [
      "gp-wip(E01-F01-T01): tur 1",
      "gp-wip(E01-F01-T02): tur 2",
      "gp(E01-F01-T03): bitti",
      "normal bir commit",
    ];
    const orphans = findOrphanWipCommits(subjects, new Set(["E01-F01-T02"]));
    expect(orphans).toEqual(["gp-wip(E01-F01-T01): tur 1"]);
  });

  it("hiç WIP commit yoksa boş dizi", () => {
    expect(findOrphanWipCommits(["gp(E01): bitti", "ilk commit"], new Set())).toEqual([]);
  });

  it("resumingNodeIds boşsa TÜM WIP commit'ler yetim sayılır", () => {
    const subjects = ["gp-wip(E01-F01-T01): tur 1", "gp-wip(E01-F01-T02): tur 1"];
    expect(findOrphanWipCommits(subjects, new Set())).toEqual(subjects);
  });
});
