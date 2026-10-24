import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * SPEC/roadmap 6.3 — `_metrics/*.jsonl`'e ekleme/okuma. Faz 6'da sadece fix-loop'un
 * kendi ihtiyacı için minimal; Faz 8 tam ölçüm altyapısını bunun ÜZERİNE inşa eder
 * (bu dosyayı değiştirmez, genişletir).
 */
export function appendMetric(
  graphRootDir: string,
  file: string,
  record: Record<string, unknown>,
): void {
  const path = join(graphRootDir, "_metrics", file);
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify(record)}\n`, "utf-8");
}

export function readMetrics(graphRootDir: string, file: string): Record<string, unknown>[] {
  const path = join(graphRootDir, "_metrics", file);
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf-8")
    .split("\n")
    .filter((l) => l.trim() !== "")
    .map((l) => JSON.parse(l) as Record<string, unknown>);
}
