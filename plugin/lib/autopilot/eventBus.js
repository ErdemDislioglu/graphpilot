import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
function eventsPath(graphRootDir) {
    return join(graphRootDir, "_runtime", "events.jsonl");
}
/**
 * Roadmap 12.3 — "Olaylar `.graph/_runtime/events.jsonl`'e de yazılır (denetim ve hata
 * ayıklama için)". Bildirim katmanı bu dosyaya ABONE OLUR; yürütücü hangi kanalın
 * dinlediğini BİLMEZ — gevşek bağlılık.
 */
export function emitEvent(graphRootDir, event) {
    const dir = join(graphRootDir, "_runtime");
    mkdirSync(dir, { recursive: true });
    const seq = readEvents(graphRootDir).length;
    const full = { ...event, ts: new Date().toISOString(), seq };
    appendFileSync(eventsPath(graphRootDir), `${JSON.stringify(full)}\n`, "utf-8");
    return full;
}
export function readEvents(graphRootDir) {
    const path = eventsPath(graphRootDir);
    if (!existsSync(path))
        return [];
    return readFileSync(path, "utf-8")
        .split("\n")
        .filter((l) => l.trim() !== "")
        .map((l) => JSON.parse(l));
}
/**
 * `afterSeq`'ten SONRAKİ olayları döner (sıra numarasıyla — zaman damgası aynı
 * milisaniyeye düşen art arda olayları ayırt edemediği için `ts` yerine `seq` kullanılır).
 */
export function readEventsSince(graphRootDir, afterSeq, types) {
    return readEvents(graphRootDir).filter((e) => e.seq > afterSeq && (!types || types.includes(e.type)));
}
