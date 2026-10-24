/**
 * Roadmap 12.2/12.5 — `quiet_hours: "00:00-08:00"` ("bu saatlerde sadece kritik mesaj").
 * "SS:DD-SS:DD" biçimi `config.ts`'in `AUTOPILOT_SCOPE_RE`'siyle değil, `QUIET_HOURS_RE`
 * ile zaten doğrulandı — burası sadece "şu an bu pencerenin içinde mi" sorusunu saf bir
 * fonksiyon olarak çözer (test edilebilir, `Date` enjekte edilir).
 */
export function isWithinQuietHours(quietHours: string, now: Date): boolean {
  const m = quietHours.match(/^(\d{2}):(\d{2})-(\d{2}):(\d{2})$/);
  if (!m) return false;
  const startMin = Number(m[1]) * 60 + Number(m[2]);
  const endMin = Number(m[3]) * 60 + Number(m[4]);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  if (startMin === endMin) return false; // sıfır genişlikli pencere — hiçbir zaman "içinde" sayılmaz
  if (startMin < endMin) return nowMin >= startMin && nowMin < endMin;
  return nowMin >= startMin || nowMin < endMin; // gece yarısını aşan pencere (ör. "22:00-06:00")
}
