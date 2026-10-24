import { describe, expect, it } from "vitest";
import { TaskFrontmatterSchema } from "../schema/index.js";

const BASE = {
  id: "E01-F01-T01",
  kind: "task",
  name: "a",
  level: 3,
  summary: "s",
  type: "feature",
  complexity: "low",
  risk: "low",
  context_size: "small",
  model: "auto",
  agent: "auto",
  context_budget: 8000,
  status: "pending",
};

describe("TaskFrontmatterSchema — tags/assignee (Faz 13.3 eklemesi)", () => {
  it("tags/assignee hiç verilmezse varsayılan: tags:[], assignee:'auto'", () => {
    const result = TaskFrontmatterSchema.parse(BASE);
    expect(result.tags).toEqual([]);
    expect(result.assignee).toBe("auto");
  });

  it("tags verilirse korunur", () => {
    const result = TaskFrontmatterSchema.parse({ ...BASE, tags: ["auth", "security"] });
    expect(result.tags).toEqual(["auth", "security"]);
  });

  it("assignee 'senior' elle atanabilir", () => {
    const result = TaskFrontmatterSchema.parse({ ...BASE, assignee: "senior" });
    expect(result.assignee).toBe("senior");
  });

  it("geçersiz assignee reddedilir", () => {
    const result = TaskFrontmatterSchema.safeParse({ ...BASE, assignee: "lead" });
    expect(result.success).toBe(false);
  });

  it("agent: 'senior' kabul edilir (Faz 13 eklemesi)", () => {
    const result = TaskFrontmatterSchema.parse({ ...BASE, agent: "senior" });
    expect(result.agent).toBe("senior");
  });
});
