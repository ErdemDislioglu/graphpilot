import { describe, expect, it } from "vitest";
import { buildHeadlessArgs, runNodeHeadless } from "../runModeB.js";

const AGENT_DEF = { tools: "Read,Edit,Write,Bash", systemPrompt: "Sen koderısın." };
const ROUTE = { model: "sonnet", max_turns: 25 };

describe("buildHeadlessArgs", () => {
  it("--bare İÇERMEZ (ADR-001 — abonelik korunur)", () => {
    const args = buildHeadlessArgs("context içeriği", AGENT_DEF, ROUTE);
    expect(args).not.toContain("--bare");
  });

  it("model, max-turns, append-system-prompt ve allowedTools'u doğru geçirir", () => {
    const args = buildHeadlessArgs("context içeriği", AGENT_DEF, ROUTE);
    expect(args).toContain("--model");
    expect(args).toContain("sonnet");
    expect(args).toContain("--max-turns");
    expect(args).toContain("25");
    expect(args).toContain("--append-system-prompt");
    expect(args).toContain("Sen koderısın.");
    expect(args).toContain("--allowedTools");
    expect(args).toContain("Read,Edit,Write,Bash");
    expect(args).toContain("-p");
    expect(args).toContain("context içeriği");
  });
});

describe("runNodeHeadless — mock spawner", () => {
  it("status:0 ise ok:true döner", () => {
    const result = runNodeHeadless("ctx", AGENT_DEF, ROUTE, () => ({ stdout: "{}", status: 0 }));
    expect(result.ok).toBe(true);
  });

  it("status != 0 ise ok:false döner", () => {
    const result = runNodeHeadless("ctx", AGENT_DEF, ROUTE, () => ({ stdout: "hata", status: 1 }));
    expect(result.ok).toBe(false);
  });

  it("spawner'a doğru argümanları geçirir", () => {
    let captured: string[] = [];
    runNodeHeadless("ctx", AGENT_DEF, ROUTE, (args) => {
      captured = args;
      return { stdout: "{}", status: 0 };
    });
    expect(captured).toEqual(buildHeadlessArgs("ctx", AGENT_DEF, ROUTE));
  });
});
