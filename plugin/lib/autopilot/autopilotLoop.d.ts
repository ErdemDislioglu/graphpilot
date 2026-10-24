import { type ClaudeHeadlessSpawner } from "../runModeB.js";
import { type Lang } from "./messages.js";
import type { Notifier } from "./notifier.js";
import type { TelegramPoller } from "./telegramPoller.js";
export type AutopilotStopReason = "finished" | "deadlock" | "user_stop" | "spend_limit" | "max_wait_exceeded";
export interface AutopilotLoopResult {
    processedCount: number;
    stopReason: AutopilotStopReason;
}
export interface AutopilotLoopOptions {
    graphRootDir: string;
    agentsDir: string;
    notifier: Notifier;
    poller: TelegramPoller;
    lang: Lang;
    spawner?: ClaudeHeadlessSpawner;
    sleep?: (ms: number) => Promise<void>;
    now?: () => number;
    /** Uzun bir limit beklemesi bu büyüklükte parçalara bölünür — her parça arasında
     * `poller.pollOnce()` çağrılır (12.8: `/stop` bekleme sırasında da çalışmalı). */
    pollIntervalMs?: number;
    /** Test/ablasyon için: en fazla N düğüm işlendikten sonra dur. */
    maxNodes?: number;
    /** SADECE test için: `runNodeHeadlessWithRetry`'nin KISA retry katmanına (Faz 9.2)
     * enjekte edilir — verilmezse üretimdeki gerçek `execSync('sleep N')` davranışı korunur. */
    shortRetrySleep?: (seconds: number) => void;
}
/**
 * Roadmap 12 (mimari) — "Yürütücü" + "Zamanlayıcı" + "Onay kuyruğu"nu tek bir döngüde
 * birleştirir; "Bildirim" `Notifier` arayüzü üzerinden (12.4), "Olay yolu" `eventBus.ts`
 * üzerinden (12.3) ayrıdır. `/gp:run`/`gp run`'ın İLK/TEMEL sürümünün (6.9/9.2) tek-düğüm-
 * seç-çalıştır döngüsü üzerine kurulur; escalation/fix_loop Mod B'de henüz entegre DEĞİL
 * (bilinen, önceden belgelenen kapsam sınırı — roadmap 6.9/9.2) — gerçek başarısızlık
 * doğrudan `failed` olur ve onay akışına (12.6) girer.
 */
export declare function runAutopilotLoop(options: AutopilotLoopOptions): Promise<AutopilotLoopResult>;
