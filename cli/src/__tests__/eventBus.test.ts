import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { emitEvent, readEvents, readEventsSince } from "../autopilot/eventBus.js";

describe("emitEvent / readEvents", () => {
  it("_runtime/events.jsonl'e gerçekten yazar, ts ekler", () => {
    const dir = mkdtempSync(join(tmpdir(), "gp-eventbus-test-"));
    try {
      const emitted = emitEvent(dir, { type: "node_done", nodeId: "E01-F01-T01" });
      expect(emitted.ts).toBeTruthy();
      expect(emitted.seq).toBe(0);
      const events = readEvents(dir);
      expect(events).toEqual([
        { type: "node_done", nodeId: "E01-F01-T01", ts: emitted.ts, seq: 0 },
      ]);
      const raw = readFileSync(join(dir, "_runtime", "events.jsonl"), "utf-8");
      expect(raw.trim().split("\n")).toHaveLength(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("hiç olay yoksa boş dizi döner, çökmez", () => {
    const dir = mkdtempSync(join(tmpdir(), "gp-eventbus-test-"));
    try {
      expect(readEvents(dir)).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("birden fazla olay sırayla eklenir", () => {
    const dir = mkdtempSync(join(tmpdir(), "gp-eventbus-test-"));
    try {
      emitEvent(dir, { type: "node_done", nodeId: "T01" });
      emitEvent(dir, { type: "epic_done", epicId: "E01" });
      emitEvent(dir, { type: "finished" });
      expect(readEvents(dir).map((e) => e.type)).toEqual(["node_done", "epic_done", "finished"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("readEventsSince", () => {
  it("belirli bir sıra numarasından SONRAKİ olayları filtreler (ts DEĞİL — aynı milisaniyeye düşebilir)", () => {
    const dir = mkdtempSync(join(tmpdir(), "gp-eventbus-test-"));
    try {
      const first = emitEvent(dir, { type: "node_done", nodeId: "T01" });
      emitEvent(dir, { type: "epic_done", epicId: "E01" });
      const result = readEventsSince(dir, first.seq);
      expect(result.map((e) => e.type)).toEqual(["epic_done"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("tip filtresi verilirse sadece o tipler döner", () => {
    const dir = mkdtempSync(join(tmpdir(), "gp-eventbus-test-"));
    try {
      emitEvent(dir, { type: "node_done", nodeId: "T01" });
      emitEvent(dir, { type: "failure", nodeId: "T02" });
      const result = readEventsSince(dir, -1, ["failure"]);
      expect(result.map((e) => e.type)).toEqual(["failure"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
