import type { Graph } from "./graph/types.js";
/**
 * SPEC §9 — `INDEX.md`/`_index.md` üretimi. **Deterministik olmalı**: aynı graph
 * her zaman aynı byte dizisini üretir (tarih, rastgelelik, Map iterasyon sırasına
 * güven YOK — her yerde açık `.sort()`).
 */
export declare function generateRootIndex(graph: Graph): string;
export declare function generateEpicIndex(graph: Graph, epicId: string): string;
