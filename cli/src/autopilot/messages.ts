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
export function formatTokenCount(tokens: number): string {
  if (tokens >= 1000) return `${Math.round(tokens / 1000)}K`;
  return String(tokens);
}

export function epicDoneMessage(
  lang: Lang,
  opts: {
    epicId: string;
    epicTitle: string;
    taskCount: number;
    tokens: number;
    nextEpicId?: string;
    nextEpicTitle?: string;
  },
): TemplateMessage {
  const tok = formatTokenCount(opts.tokens);
  const next =
    opts.nextEpicId && opts.nextEpicTitle
      ? lang === "tr"
        ? ` · sıradaki: ${opts.nextEpicId} ${opts.nextEpicTitle}`
        : ` · next: ${opts.nextEpicId} ${opts.nextEpicTitle}`
      : "";
  const text =
    lang === "tr"
      ? `✅ ${opts.epicId} ${opts.epicTitle} tamamlandı · ${opts.taskCount} görev · ${tok} token${next}`
      : `✅ ${opts.epicId} ${opts.epicTitle} done · ${opts.taskCount} tasks · ${tok} tokens${next}`;
  return { text };
}

export function failureApprovalMessage(
  lang: Lang,
  opts: { nodeId: string; nodeTitle: string; attempts: number; lastError: string },
): TemplateMessage {
  const text =
    lang === "tr"
      ? `⚠️ ${opts.nodeId} "${opts.nodeTitle}" ${opts.attempts} denemede geçemedi (son hata: ${opts.lastError}).`
      : `⚠️ ${opts.nodeId} "${opts.nodeTitle}" failed after ${opts.attempts} attempts (last error: ${opts.lastError}).`;
  const buttons: NotifierOption[] =
    lang === "tr"
      ? [
          { label: "Tekrar dene", value: "retry" },
          { label: "Üst modelle dene", value: "escalate" },
          { label: "Atla", value: "skip" },
          { label: "Durdur", value: "stop" },
        ]
      : [
          { label: "Retry", value: "retry" },
          { label: "Retry with higher model", value: "escalate" },
          { label: "Skip", value: "skip" },
          { label: "Stop", value: "stop" },
        ];
  return { text, buttons };
}

export function limitMessage(
  lang: Lang,
  opts: { resetHint?: string; doneCount: number; totalCount: number },
): TemplateMessage {
  const reset = opts.resetHint
    ? lang === "tr"
      ? `~${opts.resetHint}'de otomatik devam edecek.`
      : `will auto-resume around ${opts.resetHint}.`
    : lang === "tr"
      ? "sıfırlanınca otomatik devam edecek."
      : "will auto-resume once the limit resets.";
  const text =
    lang === "tr"
      ? `⏸ Kullanım limiti doldu. ${reset} ${opts.doneCount}/${opts.totalCount} görev tamam.`
      : `⏸ Usage limit reached. ${reset} ${opts.doneCount}/${opts.totalCount} tasks done.`;
  return { text };
}

export function resumeMessage(lang: Lang, opts: { nodeId: string }): TemplateMessage {
  const text =
    lang === "tr"
      ? `▶️ Devam ediliyor: ${opts.nodeId} kaldığı yerden.`
      : `▶️ Resuming: ${opts.nodeId} from where it left off.`;
  return { text };
}

export function finishedMessage(
  lang: Lang,
  opts: { taskCount: number; tokens: number; escalations: number; reportPath: string },
): TemplateMessage {
  const tok = formatTokenCount(opts.tokens);
  const text =
    lang === "tr"
      ? `🏁 Proje tamamlandı · ${opts.taskCount} görev · ~${tok} token · ${opts.escalations} yükseltme · rapor: ${opts.reportPath}`
      : `🏁 Project complete · ${opts.taskCount} tasks · ~${tok} tokens · ${opts.escalations} escalations · report: ${opts.reportPath}`;
  return { text };
}

/**
 * Roadmap 13.9 — yöneticinin kullanıcıya eskalasyonu (bir bulgu üzerinden). Örnekle
 * birebir: durum + etki + öneri + bulgunun kendi seçenekleri (önerilen olan işaretli)
 * + her zaman eklenen bir "Durdur" butonu (bulgunun kendi `options` dizisinde YOKTUR —
 * roadmap'in örneğinde 3 seçenek + 1 ayrı "Durdur" butonu var).
 */
export function decisionNeededMessage(
  lang: Lang,
  opts: {
    nodeId: string;
    nodeTitle: string;
    situation: string;
    impactText: string;
    recommendedOption: string;
    options: string[];
    recommendedIndex: number;
  },
): TemplateMessage {
  const text =
    lang === "tr"
      ? [
          `❓ Karar gerekiyor · ${opts.nodeId} "${opts.nodeTitle}"`,
          `Durum: ${opts.situation}`,
          `Etki: ${opts.impactText}`,
          `Yöneticinin önerisi: ${opts.recommendedOption}`,
        ].join("\n")
      : [
          `❓ Decision needed · ${opts.nodeId} "${opts.nodeTitle}"`,
          `Status: ${opts.situation}`,
          `Impact: ${opts.impactText}`,
          `Manager's recommendation: ${opts.recommendedOption}`,
        ].join("\n");

  const buttons: NotifierOption[] = opts.options.map((label, i) => ({
    label: i === opts.recommendedIndex ? `${label} (önerilen)` : label,
    value: String(i),
  }));
  buttons.push({ label: lang === "tr" ? "Durdur" : "Stop", value: "stop" });

  return { text, buttons };
}

/** Roadmap 13.9/13.11 — "Etki" satrı için deterministik metin ("Bu karar X ve Y'yi
 * bekletiyor. Diğer N görev devam ediyor."). Sayım `approvalFlow.ts`/`messages.ts`'in
 * dışında (graph'a bakması gerekiyor) — çağıran taraf hesaplar, burada sadece BİÇİMLENDİRİLİR. */
export function formatImpactText(
  lang: Lang,
  opts: { blockedTaskIds: string[]; independentCount: number },
): string {
  const blocked = opts.blockedTaskIds.length > 0 ? opts.blockedTaskIds.join(", ") : null;
  if (lang === "tr") {
    const blockedPart = blocked ? `Bu karar ${blocked}'i bekletiyor. ` : "Bekleyen bağımlı görev yok. ";
    return `${blockedPart}Diğer ${opts.independentCount} görev devam ediyor.`;
  }
  const blockedPart = blocked ? `This decision is blocking ${blocked}. ` : "No dependent tasks are waiting. ";
  return `${blockedPart}${opts.independentCount} other tasks continue.`;
}
