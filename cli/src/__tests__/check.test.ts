import { describe, expect, it } from "vitest";
import { extractAcceptanceCriteria, runAcceptanceCheck } from "../check.js";

describe("runAcceptanceCheck — mock spawner", () => {
  it("başarılı structured_output'u ayrıştırır", () => {
    const result = runAcceptanceCheck("- A çalışmalı\n- B çalışmalı", "diff içeriği", {
      spawner: () =>
        ({
          stdout: JSON.stringify({
            structured_output: {
              results: [
                { kriter: "A çalışmalı", durum: "ok", not: "test geçti" },
                { kriter: "B çalışmalı", durum: "eksik", not: "test yok" },
              ],
            },
          }),
          status: 0,
        }) as const,
    });
    expect(result.success).toBe(true);
    expect(result.results).toHaveLength(2);
    expect(result.results[1].durum).toBe("eksik");
  });

  it("structured_output alanı YOKSA success:false döner — 'ok' saymaz (ADR-008)", () => {
    const result = runAcceptanceCheck("kriter", "diff", {
      spawner: () => ({ stdout: JSON.stringify({ result: "model reddetti" }), status: 0 }),
    });
    expect(result.success).toBe(false);
    expect(result.results).toEqual([]);
    expect(result.error).toContain("structured_output");
  });

  it("claude -p çağrısı geçersiz JSON döndürürse success:false döner, çökmez", () => {
    const result = runAcceptanceCheck("kriter", "diff", {
      spawner: () => ({ stdout: "bu JSON değil {{{", status: 1 }),
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("başarısız");
  });

  it("--model verilirse spawner'a argüman olarak geçer", () => {
    let capturedArgs: string[] = [];
    runAcceptanceCheck("kriter", "diff", {
      model: "haiku",
      spawner: (args) => {
        capturedArgs = args;
        return { stdout: JSON.stringify({ structured_output: { results: [] } }), status: 0 };
      },
    });
    expect(capturedArgs).toContain("--model");
    expect(capturedArgs).toContain("haiku");
    expect(capturedArgs).toContain("--json-schema");
  });

  it("boş results dizisi de geçerli bir başarı sayılır (tüm kriterler kontrol edildi, 0 kriter değil)", () => {
    const result = runAcceptanceCheck("kriter", "diff", {
      spawner: () => ({
        stdout: JSON.stringify({ structured_output: { results: [] } }),
        status: 0,
      }),
    });
    expect(result.success).toBe(true);
    expect(result.results).toEqual([]);
  });
});

describe("extractAcceptanceCriteria", () => {
  it("## Kabul kriterleri bölümünü döndürür", () => {
    const task = { body: "## Görev\nx\n\n## Kabul kriterleri\n- A\n- B\n" } as Parameters<
      typeof extractAcceptanceCriteria
    >[0];
    expect(extractAcceptanceCriteria(task)).toBe("- A\n- B");
  });
});
