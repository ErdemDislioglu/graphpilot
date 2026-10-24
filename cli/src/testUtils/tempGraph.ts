import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { parseGraph } from "../graph/parser.js";
import type { Graph } from "../graph/types.js";

/**
 * Testler için: `files` haritasındaki (göreli yol → içerik) dosyalardan geçici bir
 * `.graph/` dizini kurar, parse eder, Graph'ı döndürür ve dizini otomatik siler.
 * Birden çok test dosyası (validate, next, status, set, route, context, new, resume)
 * bunu paylaşır — tekrar yok.
 */
export function withTempGraph<T>(
  files: Record<string, string>,
  fn: (graph: Graph, dir: string) => T,
): T {
  const dir = setupTempGraphDir(files);
  try {
    return fn(parseGraph(dir), dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * `withTempGraph`'in async sürümü — `cli.test.ts` gibi `fn`'in kendisi `await` içerdiği
 * (örn. commander'ın `parseAsync`'i) durumlar için. **Senkron `withTempGraph`'ı burada
 * `await` ile çağırma**: onun `finally`'si senkron çalışır, bir Promise'i beklemez —
 * callback'in içindeki iş bitmeden geçici dizin silinir (race condition). Bu yüzden
 * ayrı, açıkça async bir fonksiyon olarak tutuluyor; mevcut 12 senkron test dosyasına
 * dokunulmuyor.
 */
export async function withTempGraphAsync<T>(
  files: Record<string, string>,
  fn: (graph: Graph, dir: string) => Promise<T>,
): Promise<T> {
  const dir = setupTempGraphDir(files);
  try {
    return await fn(parseGraph(dir), dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function setupTempGraphDir(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "gp-test-"));
  for (const [relPath, content] of Object.entries(files)) {
    const full = join(dir, relPath);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content, "utf-8");
  }
  return dir;
}
