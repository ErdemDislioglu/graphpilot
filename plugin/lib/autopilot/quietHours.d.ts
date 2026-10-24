/**
 * Roadmap 12.2/12.5 — `quiet_hours: "00:00-08:00"` ("bu saatlerde sadece kritik mesaj").
 * "SS:DD-SS:DD" biçimi `config.ts`'in `AUTOPILOT_SCOPE_RE`'siyle değil, `QUIET_HOURS_RE`
 * ile zaten doğrulandı — burası sadece "şu an bu pencerenin içinde mi" sorusunu saf bir
 * fonksiyon olarak çözer (test edilebilir, `Date` enjekte edilir).
 */
export declare function isWithinQuietHours(quietHours: string, now: Date): boolean;
