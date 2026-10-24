/** Abonelik kullanım limiti — SADECE reset zamanına kadar beklemekle çözülür. */
const USAGE_LIMIT_PATTERNS = [
    "you've hit your session limit",
    "you've hit your weekly limit",
    "you've hit your opus limit",
    "you've hit your sonnet limit",
    "you've hit your haiku limit",
    "you've hit your individual usage limit",
];
/** Harcama tavanı — bekleyerek çözülmez, bir YÖNETİCİNİN limiti artırması gerekir. */
const SPEND_LIMIT_PATTERNS = [
    "you've hit your monthly spend limit",
    "you've hit your individual spend limit",
    "you've hit your org's monthly spend limit",
    "you've hit your channel's monthly spend limit",
    "you've hit your team's shared budget",
    "credit balance is too low",
];
/** Kısa süreli API rate limit — saniyeler/dakikalar içinde kendi kendine açılır. */
const RATE_LIMIT_PATTERNS = [
    "server is temporarily limiting requests",
    "rate limit",
    "rate_limit",
    "429",
];
const RESET_TIME_RE = /\b(\d{1,2}:\d{2}\s?(?:am|pm)?)\b/i;
export function classifyLimitError(text) {
    const lower = text.toLowerCase();
    for (const p of SPEND_LIMIT_PATTERNS) {
        if (lower.includes(p))
            return withResetHint({ kind: "spend_limit", matchedText: p }, text);
    }
    for (const p of USAGE_LIMIT_PATTERNS) {
        if (lower.includes(p))
            return withResetHint({ kind: "usage_limit", matchedText: p }, text);
    }
    for (const p of RATE_LIMIT_PATTERNS) {
        if (lower.includes(p))
            return withResetHint({ kind: "rate_limit", matchedText: p }, text);
    }
    return { kind: null };
}
function withResetHint(base, text) {
    const m = text.match(RESET_TIME_RE);
    return m ? { ...base, resetHint: m[1] } : base;
}
