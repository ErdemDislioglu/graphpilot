/** Roadmap 13.8'in kendi tablosu — "balanced" seviyesi birebir bu. */
const BALANCED = {
    fix_loop_not_converged: "self",
    non_blocking_in_scope: "self",
    small_scope_task_needed: "self",
    ordering_or_parallelism_change: "self",
    tag_correction: "self",
    architecture_choice: "consult_senior",
    security_vulnerability: "ask_user",
    data_loss_risk: "ask_user",
    scope_conflict: "ask_user",
    senior_failed: "ask_user",
    budget_exceeded: "ask_user",
};
/**
 * Roadmap 13.8 — "`autonomy: cautious` ve `bold` seviyeleri için aynı tablonun
 * varyantları." Hangi satırların KAYACAĞI roadmap'te belirtilmemiş — şu yorum seçildi:
 * `cautious`'ta geri alınması daha zor olan "self" satırları (fix_loop/sıra-paralellik/
 * mimari) `ask_user`'a yükselir; `bold`'ta bazı "ask_user" satırları `self`/
 * `consult_senior`'a iner. **İKİ SEVİYEDE DE SABİT KALAN:** `security_vulnerability` ve
 * `data_loss_risk` ASLA `self` olamaz — "dengeli yetki" ilkesinin temel sınırı, autonomy
 * bunu aşamaz (geri alınamaz/güvenlik riskini otonomi seviyesi gevşetmez).
 */
const CAUTIOUS = {
    ...BALANCED,
    fix_loop_not_converged: "ask_user",
    small_scope_task_needed: "ask_user",
    ordering_or_parallelism_change: "ask_user",
    architecture_choice: "ask_user",
};
const BOLD = {
    ...BALANCED,
    scope_conflict: "self",
    senior_failed: "consult_senior",
    budget_exceeded: "self",
};
const TABLES = {
    cautious: CAUTIOUS,
    balanced: BALANCED,
    bold: BOLD,
};
/** Roadmap 13.8 — "Kural özeti: geri alınabilir ve kapsam içindeyse yönetici karar
 * verir, değilse sorar." Saf, deterministik — LLM çağırmaz (13.12: "rutin akışta
 * yönetici LLM'i hiç çağrılmaz" tam olarak bu fonksiyonun kendisi sayesinde doğru). */
export function decideManagerAction(situation, autonomy) {
    return TABLES[autonomy][situation];
}
/**
 * Roadmap 13.8 — "Mimari tercih... senior'a danışır, senior net öneri verirse kendisi
 * karar verir, emin değilse kullanıcıya sorar." `consult_senior`'ın İKİNCİ adımı: senior'ın
 * cevabının "net bir öneri" olup olmadığı YÖNETİCİNİN (LLM) kendi okuması/yargısı —
 * bu fonksiyon o yargıyı TEKRAR ETMEZ, sadece onu eyleme çevirir (iki değerli, saf eşleme).
 */
export function decideAfterSeniorConsultation(seniorGaveConfidentRecommendation) {
    return seniorGaveConfidentRecommendation ? "self" : "ask_user";
}
