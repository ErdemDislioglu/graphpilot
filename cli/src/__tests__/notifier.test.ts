import { describe, expect, it } from "vitest";
import { MockNotifier, RetryingNotifier, type Notifier } from "../autopilot/notifier.js";

describe("MockNotifier", () => {
  it("send çağrılarını kaydeder", async () => {
    const n = new MockNotifier();
    await n.send("merhaba");
    expect(n.sent).toEqual(["merhaba"]);
  });

  it("ask kuyruktaki cevabı sırayla döner", async () => {
    const n = new MockNotifier({ answers: ["retry", "skip"] });
    const a1 = await n.ask("ne yapalım?", [{ label: "Tekrar dene", value: "retry" }]);
    const a2 = await n.ask("ne yapalım?", [{ label: "Atla", value: "skip" }]);
    expect([a1, a2]).toEqual(["retry", "skip"]);
    expect(n.asked).toHaveLength(2);
  });

  it("cevap kuyruğu boşken ask çağrılırsa anlamlı hata fırlatır", async () => {
    const n = new MockNotifier();
    await expect(n.ask("soru", [])).rejects.toThrow(/kuyruğu boş/);
  });

  it("onAsk callback'i varsa dinamik cevap üretir", async () => {
    const n = new MockNotifier({ onAsk: (_q, opts) => opts[0].value });
    const a = await n.ask("soru", [{ label: "İlk", value: "ilk-deger" }]);
    expect(a).toBe("ilk-deger");
  });

  it("edit çağrılarını kaydeder", async () => {
    const n = new MockNotifier();
    await n.edit("msg-1", "güncellendi");
    expect(n.edited).toEqual([{ messageId: "msg-1", text: "güncellendi" }]);
  });
});

describe("RetryingNotifier — Faz 12.4 'bildirim hatası yürütmeyi asla durdurmaz'", () => {
  class FlakyNotifier implements Notifier {
    calls = 0;
    async send(): Promise<void> {
      this.calls += 1;
      throw new Error("ağ hatası");
    }
    async ask(): Promise<string> {
      return "ok";
    }
    async edit(): Promise<void> {
      throw new Error("ağ hatası");
    }
  }

  it("send başarısız olursa hatayı YUTAR (fırlatmaz), kuyruğa ekler", async () => {
    const flaky = new FlakyNotifier();
    const retrying = new RetryingNotifier(flaky);
    await expect(retrying.send("merhaba")).resolves.toBeUndefined();
    expect(retrying.failedQueue).toHaveLength(1);
  });

  it("flush() kuyruktaki mesajı tekrar dener", async () => {
    let shouldFail = true;
    const inner: Notifier = {
      send: async (msg) => {
        if (shouldFail) throw new Error("ağ hatası");
        sentOk.push(msg);
      },
      ask: async () => "ok",
      edit: async () => {},
    };
    const sentOk: string[] = [];
    const retrying = new RetryingNotifier(inner);
    await retrying.send("ilk deneme");
    expect(retrying.failedQueue).toHaveLength(1);

    shouldFail = false;
    await retrying.flush();
    expect(sentOk).toEqual(["ilk deneme"]);
    expect(retrying.failedQueue).toHaveLength(0);
  });

  it("ask() SARILMAZ — doğrudan iç notifier'a gider", async () => {
    const flaky = new FlakyNotifier();
    const retrying = new RetryingNotifier(flaky);
    expect(await retrying.ask("soru", [])).toBe("ok");
  });

  it("onError callback'i çağrılır", async () => {
    const flaky = new FlakyNotifier();
    const errors: unknown[] = [];
    const retrying = new RetryingNotifier(flaky, (e) => errors.push(e));
    await retrying.send("x");
    expect(errors).toHaveLength(1);
  });
});
