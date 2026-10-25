import { describe, expect, it } from "vitest";
import { runChecks, runVerify } from "../checks.js";

describe("runChecks — mock runner (hızlı, deterministik)", () => {
  it("sadece yapılandırılmış komutları, sırayla çalıştırır", () => {
    const calls: string[] = [];
    const results = runChecks(
      "/proje",
      { build: "npm run build", test: "npm test" }, // lint yok
      (command) => {
        calls.push(command);
        return { ok: true, output: "" };
      },
    );
    expect(calls).toEqual(["npm run build", "npm test"]);
    expect(results.map((r) => r.name)).toEqual(["build", "test"]);
  });

  it("başarısızlıkta sadece son N satırı döner, hepsini değil", () => {
    const longOutput = Array.from({ length: 200 }, (_, i) => `satır ${i}`).join("\n");
    const results = runChecks("/proje", { test: "npm test" }, () => ({
      ok: false,
      output: longOutput,
    }));
    const lineCount = results[0].output!.split("\n").length;
    expect(lineCount).toBeLessThanOrEqual(50);
    expect(results[0].output).toContain("satır 199"); // son satır korunmuş
    expect(results[0].output).not.toContain("satır 0\n"); // ilk satırlar kırpılmış
  });

  it("başarılı sonuçta output alanı yok (gereksiz token taşınmaz)", () => {
    const results = runChecks("/proje", { build: "ok-komut" }, () => ({
      ok: true,
      output: "gürültü çıktısı",
    }));
    expect(results[0].ok).toBe(true);
    expect(results[0].output).toBeUndefined();
  });

  it("hiç check yapılandırılmamışsa boş dizi döner", () => {
    expect(runChecks("/proje", {}, () => ({ ok: true, output: "" }))).toEqual([]);
  });

  it("Faz 7.3 — trimOutput:false ise kırpma devre dışı (ablasyon için)", () => {
    const longOutput = Array.from({ length: 200 }, (_, i) => `satır ${i}`).join("\n");
    const results = runChecks(
      "/proje",
      { test: "npm test" },
      () => ({ ok: false, output: longOutput }),
      { trimOutput: false },
    );
    expect(results[0].output!.split("\n").length).toBe(200);
    expect(results[0].output).toContain("satır 0");
  });
});

describe("runChecks — gerçek execSync (mock yok)", () => {
  it("gerçekten başarılı bir shell komutunu çalıştırır", () => {
    const results = runChecks(process.cwd(), { build: "echo merhaba" });
    expect(results[0].ok).toBe(true);
  });

  it("gerçekten başarısız bir komutun hatasını yakalar", () => {
    const results = runChecks(process.cwd(), { test: "exit 1" });
    expect(results[0].ok).toBe(false);
  });
});

describe("runVerify — Faz 14 O9", () => {
  it("tüm komutları sırayla çalıştırır, başarısızda durmaz ve çıktıyı yalnız başarısızda verir", () => {
    const calls: string[] = [];
    const results = runVerify("/proje", ["a", "b", "c"], (command, cwd) => {
      calls.push(`${cwd}:${command}`);
      return command === "b" ? { ok: false, output: "hata\n" } : { ok: true, output: "çıktı" };
    });
    expect(calls).toEqual(["/proje:a", "/proje:b", "/proje:c"]);
    expect(results).toEqual([
      { command: "a", ok: true, output: undefined },
      { command: "b", ok: false, output: "hata" },
      { command: "c", ok: true, output: undefined },
    ]);
  });
});
