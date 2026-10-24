import { describe, expect, it } from "vitest";
import { planLimitWait, resetHintToEpochMs } from "../autopilot/limitWait.js";

describe("resetHintToEpochMs", () => {
  it("gelecekteki bugünün saatine çözümlenir", () => {
    const now = new Date("2026-10-24T10:00:00").getTime();
    const target = resetHintToEpochMs("14:20", now);
    expect(new Date(target!).toISOString()).toBe(new Date("2026-10-24T14:20:00").toISOString());
  });

  it("saat zaten geçtiyse yarının aynı saatine çözümlenir", () => {
    const now = new Date("2026-10-24T20:00:00").getTime();
    const target = resetHintToEpochMs("14:20", now);
    expect(new Date(target!).toISOString()).toBe(new Date("2026-10-25T14:20:00").toISOString());
  });

  it("am/pm biçimini çözer", () => {
    const now = new Date("2026-10-24T10:00:00").getTime();
    expect(new Date(resetHintToEpochMs("3:14am", now)!).getHours()).toBe(3);
    expect(new Date(resetHintToEpochMs("3:14pm", now)!).getHours()).toBe(15);
  });

  it("anlaşılmaz biçim için null döner (tahmin etmez)", () => {
    expect(resetHintToEpochMs("yakında", Date.now())).toBeNull();
  });
});

describe("planLimitWait", () => {
  const now = new Date("2026-10-24T10:00:00").getTime();

  it("spend_limit için 'stop_unresolvable' döner (beklemek anlamsız)", () => {
    const plan = planLimitWait({ kind: "spend_limit" }, { maxWaitHours: 12, now });
    expect(plan.action).toBe("stop_unresolvable");
  });

  it("sınıflandırılamayan hata için 'stop_unresolvable' döner", () => {
    const plan = planLimitWait({ kind: null }, { maxWaitHours: 12, now });
    expect(plan.action).toBe("stop_unresolvable");
  });

  it("resetHint varsa ve max_wait_hours içindeyse o saate kadar bekler", () => {
    const plan = planLimitWait(
      { kind: "usage_limit", resetHint: "14:20" },
      { maxWaitHours: 12, now },
    );
    expect(plan.action).toBe("wait");
    expect(plan.waitMs).toBe(new Date("2026-10-24T14:20:00").getTime() - now);
  });

  it("resetHint max_wait_hours'ı aşıyorsa 'give_up' döner", () => {
    const plan = planLimitWait(
      { kind: "usage_limit", resetHint: "14:20" },
      { maxWaitHours: 1, now }, // 4h20m sonra ama max 1h
    );
    expect(plan.action).toBe("give_up");
  });

  it("resetHint yoksa 1 dakikadan başlayan artan aralık döner", () => {
    const plan = planLimitWait({ kind: "usage_limit" }, { maxWaitHours: 12, now });
    expect(plan.action).toBe("wait");
    expect(plan.waitMs).toBe(60_000);
    expect(plan.nextIntervalMs).toBe(60_000);
  });

  it("önceki aralık verilirse ikiye katlar (30dk tavanla)", () => {
    const plan1 = planLimitWait(
      { kind: "usage_limit" },
      { maxWaitHours: 12, now, previousIntervalMs: 60_000 },
    );
    expect(plan1.nextIntervalMs).toBe(120_000);

    const plan2 = planLimitWait(
      { kind: "usage_limit" },
      { maxWaitHours: 12, now, previousIntervalMs: 20 * 60_000 },
    );
    expect(plan2.nextIntervalMs).toBe(30 * 60_000); // tavan
  });

  it("artan aralık max_wait_hours'ı aşarsa 'give_up' döner", () => {
    const plan = planLimitWait(
      { kind: "usage_limit" },
      { maxWaitHours: 0.0001, now }, // ~0.36s — ilk 60s aralığı bile aşar
    );
    expect(plan.action).toBe("give_up");
  });
});
