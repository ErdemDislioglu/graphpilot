/** Roadmap 12.3 — yürütme motorunun yayınladığı olay türleri. */
export type AutopilotEventType = "node_done" | "epic_done" | "failure" | "escalated" | "limit_hit" | "resumed" | "finished" | "needs_decision" | "decision_answered";
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
/**
 * Roadmap 12.3 — "Olaylar `.graph/_runtime/events.jsonl`'e de yazılır (denetim ve hata
 * ayıklama için)". Bildirim katmanı bu dosyaya ABONE OLUR; yürütücü hangi kanalın
 * dinlediğini BİLMEZ — gevşek bağlılık.
 */
export declare function emitEvent(graphRootDir: string, event: Omit<AutopilotEvent, "ts" | "seq">): AutopilotEvent;
export declare function readEvents(graphRootDir: string): AutopilotEvent[];
/**
 * `afterSeq`'ten SONRAKİ olayları döner (sıra numarasıyla — zaman damgası aynı
 * milisaniyeye düşen art arda olayları ayırt edemediği için `ts` yerine `seq` kullanılır).
 */
export declare function readEventsSince(graphRootDir: string, afterSeq: number, types?: AutopilotEventType[]): AutopilotEvent[];
