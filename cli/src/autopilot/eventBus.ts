import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Roadmap 12.3 — yürütme motorunun yayınladığı olay türleri. */
export type AutopilotEventType =
  | "node_done"
  | "epic_done"
  | "failure"
  | "escalated"
  | "limit_hit"
  | "resumed"
  | "finished"
  | "needs_decision"
  | "decision_answered";

export interface AutopilotEvent {
  type: AutopilotEventType;
  nodeId?: string;
  epicId?: string;
  message?: string;
  data?: Record<string, unknown>;
  ts: string;
  /** Dosyadaki satır sırası (0-tabanlı) — zaman damgası aynı milisaniyeye düşen art arda
   * olayları ayırt etmek için (`readEventsSince`'in güvenilir imleci budur, ts DEĞİL). */
  seq: number;
}

function eventsPath(graphRootDir: string): string {
  return join(graphRootDir, "_runtime", "events.jsonl");
}

/**
 * Roadmap 12.3 — "Olaylar `.graph/_runtime/events.jsonl`'e de yazılır (denetim ve hata
 * ayıklama için)". Bildirim katmanı bu dosyaya ABONE OLUR; yürütücü hangi kanalın
 * dinlediğini BİLMEZ — gevşek bağlılık.
 */
export function emitEvent(
  graphRootDir: string,
  event: Omit<AutopilotEvent, "ts" | "seq">,
): AutopilotEvent {
  const dir = join(graphRootDir, "_runtime");
  mkdirSync(dir, { recursive: true });
  const seq = readEvents(graphRootDir).length;
  const full: AutopilotEvent = { ...event, ts: new Date().toISOString(), seq };
  appendFileSync(eventsPath(graphRootDir), `${JSON.stringify(full)}\n`, "utf-8");
  return full;
}

export function readEvents(graphRootDir: string): AutopilotEvent[] {
  const path = eventsPath(graphRootDir);
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf-8")
    .split("\n")
    .filter((l) => l.trim() !== "")
    .map((l) => JSON.parse(l) as AutopilotEvent);
}

/**
 * `afterSeq`'ten SONRAKİ olayları döner (sıra numarasıyla — zaman damgası aynı
 * milisaniyeye düşen art arda olayları ayırt edemediği için `ts` yerine `seq` kullanılır).
 */
export function readEventsSince(
  graphRootDir: string,
  afterSeq: number,
  types?: AutopilotEventType[],
): AutopilotEvent[] {
  return readEvents(graphRootDir).filter(
    (e) => e.seq > afterSeq && (!types || types.includes(e.type)),
  );
}
