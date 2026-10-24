import { describe, expect, it } from "vitest";
import { isWithinQuietHours } from "../autopilot/quietHours.js";

describe("isWithinQuietHours", () => {
  it("normal pencere (00:00-08:00): pencere içindeki saat true döner", () => {
    expect(isWithinQuietHours("00:00-08:00", new Date("2026-10-24T03:00:00"))).toBe(true);
  });

  it("normal pencere: pencere dışındaki saat false döner", () => {
    expect(isWithinQuietHours("00:00-08:00", new Date("2026-10-24T14:00:00"))).toBe(false);
  });

  it("bitiş sınırı HARİÇ (08:00 dahil değil)", () => {
    expect(isWithinQuietHours("00:00-08:00", new Date("2026-10-24T08:00:00"))).toBe(false);
  });

  it("başlangıç sınırı DAHİL", () => {
    expect(isWithinQuietHours("00:00-08:00", new Date("2026-10-24T00:00:00"))).toBe(true);
  });

  it("gece yarısını aşan pencere (22:00-06:00): gece yarısından sonraki saat true döner", () => {
    expect(isWithinQuietHours("22:00-06:00", new Date("2026-10-24T02:00:00"))).toBe(true);
  });

  it("gece yarısını aşan pencere: akşam saatinde de true döner", () => {
    expect(isWithinQuietHours("22:00-06:00", new Date("2026-10-24T23:00:00"))).toBe(true);
  });

  it("gece yarısını aşan pencere: gündüz saatinde false döner", () => {
    expect(isWithinQuietHours("22:00-06:00", new Date("2026-10-24T12:00:00"))).toBe(false);
  });

  it("sıfır genişlikli pencere (başlangıç==bitiş) hiçbir zaman 'içinde' sayılmaz", () => {
    expect(isWithinQuietHours("10:00-10:00", new Date("2026-10-24T10:00:00"))).toBe(false);
  });

  it("anlaşılmaz biçim için false döner (çökmez)", () => {
    expect(isWithinQuietHours("her zaman", new Date())).toBe(false);
  });
});
