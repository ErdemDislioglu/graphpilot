import { describe, expect, it } from "vitest";
import { computeTrimmedBashOutput } from "../hooks/trimBash.js";

const LONG = Array.from({ length: 200 }, (_, i) => `satır ${i}`).join("\n");

describe("computeTrimmedBashOutput — Faz 7.3 / ADR-005", () => {
  it(".graph yoksa no-op ({})", () => {
    const out = computeTrimmedBashOutput(
      { tool_name: "Bash", tool_response: { stdout: LONG } },
      { graphDirExists: false, logTrimmingEnabled: true },
    );
    expect(out).toEqual({});
  });

  it("log_trimming kapalıysa no-op", () => {
    const out = computeTrimmedBashOutput(
      { tool_name: "Bash", tool_response: { stdout: LONG } },
      { graphDirExists: true, logTrimmingEnabled: false },
    );
    expect(out).toEqual({});
  });

  it("tool Bash değilse no-op", () => {
    const out = computeTrimmedBashOutput(
      { tool_name: "Read", tool_response: { stdout: LONG } },
      { graphDirExists: true, logTrimmingEnabled: true },
    );
    expect(out).toEqual({});
  });

  it("kısa çıktıda (≤50 satır) no-op", () => {
    const out = computeTrimmedBashOutput(
      { tool_name: "Bash", tool_response: { stdout: "tek satır" } },
      { graphDirExists: true, logTrimmingEnabled: true },
    );
    expect(out).toEqual({});
  });

  it("uzun çıktıda son 50 satıra kırpar, updatedToolOutput üretir", () => {
    const out = computeTrimmedBashOutput(
      { tool_name: "Bash", tool_response: { stdout: LONG } },
      { graphDirExists: true, logTrimmingEnabled: true },
    );
    const text = out.hookSpecificOutput?.updatedToolOutput.text ?? "";
    expect(text.split("\n").length).toBe(50);
    expect(text).toContain("satır 199");
    expect(text).not.toContain("satır 0\n");
    expect(out.hookSpecificOutput?.hookEventName).toBe("PostToolUse");
  });

  it("tool_response düz string olabilir", () => {
    const out = computeTrimmedBashOutput(
      { tool_name: "Bash", tool_response: LONG },
      { graphDirExists: true, logTrimmingEnabled: true },
    );
    expect(out.hookSpecificOutput?.updatedToolOutput.text.split("\n").length).toBe(50);
  });

  it("tanınmayan tool_response şekli → no-op (tahmin etmez, bozmaz)", () => {
    const out = computeTrimmedBashOutput(
      { tool_name: "Bash", tool_response: { weirdField: 123 } },
      { graphDirExists: true, logTrimmingEnabled: true },
    );
    expect(out).toEqual({});
  });
});
