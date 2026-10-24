export interface InitResult {
    created: string[];
    skipped: string[];
}
/**
 * `/gp:init` komutunun altında çalışan deterministik kısım (SPEC §1, §7, §10 varsayılanları).
 * **Idempotent**: var olan dosyaların üzerine yazmaz — zaten başlatılmış bir graph'ta tekrar
 * çalıştırmak güvenlidir, sadece eksik parçaları tamamlar.
 */
export declare function initGraph(graphRootDir: string): InitResult;
