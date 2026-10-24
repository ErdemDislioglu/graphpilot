export type Situation = "fix_loop_not_converged" | "non_blocking_in_scope" | "small_scope_task_needed" | "ordering_or_parallelism_change" | "tag_correction" | "architecture_choice" | "security_vulnerability" | "data_loss_risk" | "scope_conflict" | "senior_failed" | "budget_exceeded";
export type ManagerAction = "self" | "consult_senior" | "ask_user";
export type Autonomy = "cautious" | "balanced" | "bold";
/** Roadmap 13.8 — "Kural özeti: geri alınabilir ve kapsam içindeyse yönetici karar
 * verir, değilse sorar." Saf, deterministik — LLM çağırmaz (13.12: "rutin akışta
 * yönetici LLM'i hiç çağrılmaz" tam olarak bu fonksiyonun kendisi sayesinde doğru). */
export declare function decideManagerAction(situation: Situation, autonomy: Autonomy): ManagerAction;
/**
 * Roadmap 13.8 — "Mimari tercih... senior'a danışır, senior net öneri verirse kendisi
 * karar verir, emin değilse kullanıcıya sorar." `consult_senior`'ın İKİNCİ adımı: senior'ın
 * cevabının "net bir öneri" olup olmadığı YÖNETİCİNİN (LLM) kendi okuması/yargısı —
 * bu fonksiyon o yargıyı TEKRAR ETMEZ, sadece onu eyleme çevirir (iki değerli, saf eşleme).
 */
export declare function decideAfterSeniorConsultation(seniorGaveConfidentRecommendation: boolean): ManagerAction;
