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

/**
 * Roadmap 9.7 — ".env ve gizli dosyalar bağlam paketine asla girmez". En-iyi-çaba bir
 * desen taraması: PEM anahtarları ve belirgin şekilde yüksek-entropili `KEY=değer` /
 * `TOKEN=değer` atamaları. Kasıtlı olarak DAR tutuldu (ör. sadece "api_key" kelimesi
 * geçmesi YETERLİ DEĞİL — gerçek bir değer biçimi gerekir) — amaç normal teknik
 * dokümantasyonu ("bu fonksiyon bir api_key parametresi alır") yanlışlıkla bloklamamak.
 */
const PATTERNS: { label: string; re: RegExp }[] = [
  { label: "PEM özel anahtarı", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { label: "AWS access key id", re: /\bAKIA[0-9A-Z]{16}\b/ },
  {
    label: "ortam değişkeni ataması (KEY/TOKEN/SECRET=yüksek-entropili değer)",
    re: /\b[A-Z][A-Z0-9_]{2,}(?:_KEY|_TOKEN|_SECRET)\s*[=:]\s*['"]?[A-Za-z0-9+/_.=-]{16,}['"]?/,
  },
];

export function scanForSecretLikeContent(text: string): SecretScanResult {
  const matches: SecretMatch[] = [];
  for (const { label, re } of PATTERNS) {
    const m = text.match(re);
    if (m) matches.push({ label, redactedSnippet: `${m[0].slice(0, 6)}…` });
  }
  return { found: matches.length > 0, matches };
}
