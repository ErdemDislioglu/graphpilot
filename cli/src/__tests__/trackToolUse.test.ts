import { describe, expect, it } from "vitest";
import { computeTrackToolUse } from "../hooks/trackToolUse.js";

const GATE_ON = { graphDirExists: true, turnLimitsEnabled: true };

describe("computeTrackToolUse — Faz 7.2/7.7/7.9 ölçüm + döngü tespiti", () => {
  it(".graph yoksa no-op, sayaç değişmez", () => {
    const result = computeTrackToolUse(
      { tool_name: "Read", tool_input: { file_path: "a.ts" } },
      { graphDirExists: false, turnLimitsEnabled: true },
      {},
    );
    expect(result).toEqual({ output: {}, updatedCounters: {}, record: null });
  });

  it("izlenmeyen bir tool (ör. TodoWrite) → no-op", () => {
    const result = computeTrackToolUse(
      { tool_name: "TodoWrite", tool_input: {} },
      GATE_ON,
      {},
    );
    expect(result.record).toBeNull();
  });

  it("ilk iki Read'de uyarı YOK, sayaç artıyor", () => {
    let counters = {};
    const r1 = computeTrackToolUse(
      { tool_name: "Read", tool_input: { file_path: "a.ts" } },
      GATE_ON,
      counters,
    );
    counters = r1.updatedCounters;
    expect(r1.output).toEqual({});
    expect(r1.record?.count).toBe(1);

    const r2 = computeTrackToolUse(
      { tool_name: "Read", tool_input: { file_path: "a.ts" } },
      GATE_ON,
      counters,
    );
    expect(r2.output).toEqual({});
    expect(r2.record?.count).toBe(2);
  });

  it("aynı dosya 3. kez okunduğunda additionalContext uyarısı üretilir", () => {
    const counters: Record<string, number> = { "Read:a.ts": 2 };
    const r3 = computeTrackToolUse(
      { tool_name: "Read", tool_input: { file_path: "a.ts" } },
      GATE_ON,
      counters,
    );
    expect(r3.output.hookSpecificOutput?.hookEventName).toBe("PreToolUse");
    expect(r3.output.hookSpecificOutput?.additionalContext).toContain("a.ts");
    expect(r3.record?.count).toBe(3);
  });

  it("4. kez tekrar uyarmaz (spam etmez) — sadece tam eşikte bir kez", () => {
    const counters: Record<string, number> = { "Read:a.ts": 3 };
    const r4 = computeTrackToolUse(
      { tool_name: "Read", tool_input: { file_path: "a.ts" } },
      GATE_ON,
      counters,
    );
    expect(r4.output).toEqual({});
    expect(r4.record?.count).toBe(4);
  });

  it("turn_limits kapalıysa 3. tekrarda da uyarı YOK ama sayaç/ölçüm yine tutulur", () => {
    const counters: Record<string, number> = { "Bash:npm test": 2 };
    const r = computeTrackToolUse(
      { tool_name: "Bash", tool_input: { command: "npm test" } },
      { graphDirExists: true, turnLimitsEnabled: false },
      counters,
    );
    expect(r.output).toEqual({});
    expect(r.record?.count).toBe(3);
  });

  it("Write + dosya önceden varsa overwritesExisting:true (7.9 diff disiplini ölçümü)", () => {
    const r = computeTrackToolUse(
      { tool_name: "Write", tool_input: { file_path: "b.ts" } },
      GATE_ON,
      {},
      true,
    );
    expect(r.record?.overwritesExisting).toBe(true);
  });

  it("Write + dosya yoksa (yeni dosya) overwritesExisting alanı yok", () => {
    const r = computeTrackToolUse(
      { tool_name: "Write", tool_input: { file_path: "c.ts" } },
      GATE_ON,
      {},
      false,
    );
    expect(r.record?.overwritesExisting).toBeUndefined();
  });

  it("Glob/Grep pattern'i de izlenir", () => {
    const r = computeTrackToolUse(
      { tool_name: "Grep", tool_input: { pattern: "foo" } },
      GATE_ON,
      {},
    );
    expect(r.record).toEqual({ tool: "Grep", target: "foo", count: 1 });
  });
});
