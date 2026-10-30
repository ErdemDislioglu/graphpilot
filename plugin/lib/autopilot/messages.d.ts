import type { NotifierOption } from "./notifier.js";
/** Roadmap 12.5 — "Mesaj dili brief'teki proje diline göre (TR/EN)". Brief'ten otomatik
 * dil tespiti bu projede henüz tanımlı değil (SPEC.md'de yapılandırılmış bir `language`
 * alanı yok); çağıran taraf (otopilot döngüsü, `config.yml`'deki `autopilot.language`'tan)
 * hangi dili kullanacağını açıkça verir. */
export type Lang = "tr" | "en";
export interface TemplateMessage {
    text: string;
    buttons?: NotifierOption[];
}
/** "142000" → "142K" — roadmap örnekleriyle birebir (12.5: "142K token", "~186K token"). */
export declare function formatTokenCount(tokens: number): string;
export declare function epicDoneMessage(lang: Lang, opts: {
    epicId: string;
    epicTitle: string;
    taskCount: number;
    tokens: number;
    nextEpicId?: string;
    nextEpicTitle?: string;
}): TemplateMessage;
export declare function failureApprovalMessage(lang: Lang, opts: {
    nodeId: string;
    nodeTitle: string;
    attempts: number;
    lastError: string;
}): TemplateMessage;
/** Roadmap 12.6 — `risk: high` görev başlamadan ÖNCE sorulur (başarısızlık değil — ayrı şablon). */
export declare function riskApprovalMessage(lang: Lang, opts: {
    nodeId: string;
    nodeTitle: string;
}): TemplateMessage;
/** `blockedDecisionMessage` seçenek butonlarının `value` öneki — `opt:<indeks>`. */
export declare const OPTION_VALUE_PREFIX = "opt:";
/**
 * Agent `blocked:` döndü — karar kullanıcıda. Agent `soru:`/`seçenek:` verdiyse (mimari
 * karar) seçenekler buton olur, "Tekrar dene" yerine geçer (seçim zaten yeniden çalıştırır).
 */
export declare function blockedDecisionMessage(lang: Lang, opts: {
    nodeId: string;
    reason: string;
    question?: {
        text: string;
        options: string[];
    };
}): TemplateMessage;
export declare function limitMessage(lang: Lang, opts: {
    resetHint?: string;
    doneCount: number;
    totalCount: number;
}): TemplateMessage;
export declare function resumeMessage(lang: Lang, opts: {
    nodeId: string;
}): TemplateMessage;
export declare function finishedMessage(lang: Lang, opts: {
    taskCount: number;
    tokens: number;
    escalations: number;
    reportPath: string;
    skippedCount?: number;
}): TemplateMessage;
/**
 * Roadmap 13.9 — yöneticinin kullanıcıya eskalasyonu (bir bulgu üzerinden). Örnekle
 * birebir: durum + etki + öneri + bulgunun kendi seçenekleri (önerilen olan işaretli)
 * + her zaman eklenen bir "Durdur" butonu (bulgunun kendi `options` dizisinde YOKTUR —
 * roadmap'in örneğinde 3 seçenek + 1 ayrı "Durdur" butonu var).
 */
export declare function decisionNeededMessage(lang: Lang, opts: {
    nodeId: string;
    nodeTitle: string;
    situation: string;
    impactText: string;
    recommendedOption: string;
    options: string[];
    recommendedIndex: number;
}): TemplateMessage;
/** Roadmap 13.9/13.11 — "Etki" satrı için deterministik metin ("Bu karar X ve Y'yi
 * bekletiyor. Diğer N görev devam ediyor."). Sayım `approvalFlow.ts`/`messages.ts`'in
 * dışında (graph'a bakması gerekiyor) — çağıran taraf hesaplar, burada sadece BİÇİMLENDİRİLİR. */
export declare function formatImpactText(lang: Lang, opts: {
    blockedTaskIds: string[];
    independentCount: number;
}): string;
