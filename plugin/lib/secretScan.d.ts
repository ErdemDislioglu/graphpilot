export interface SecretMatch {
    label: string;
    /** Sadece ilk birkaç karakter + "…" — eşleşmenin KENDİSİ asla tam olarak döndürülmez
     * (hata mesajı/log'a gerçek sırrı bir kez daha sızdırmamak için). */
    redactedSnippet: string;
}
export interface SecretScanResult {
    found: boolean;
    matches: SecretMatch[];
}
export declare function scanForSecretLikeContent(text: string): SecretScanResult;
