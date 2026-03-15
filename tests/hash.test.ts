import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { deterministicHash } from "../shared/hash.ts";

describe("deterministicHash", () => {
  it("returns a 16-char hex string", () => {
    const h = deterministicHash({ a: 1, b: 2 });
    assert.match(h, /^[0-9a-f]{16}$/);
  });

  it("is deterministic for the same input", () => {
    const a = deterministicHash({ x: 1, y: "hello" });
    const b = deterministicHash({ x: 1, y: "hello" });
    assert.strictEqual(a, b);
  });

  it("produces same hash regardless of key order", () => {
    const a = deterministicHash({ b: 2, a: 1 });
    const b = deterministicHash({ a: 1, b: 2 });
    assert.strictEqual(a, b);
  });

  it("produces different hashes for different inputs", () => {
    const a = deterministicHash({ x: 1 });
    const b = deterministicHash({ x: 2 });
    assert.notStrictEqual(a, b);
  });

  it("excludes specified keys", () => {
    const a = deterministicHash({ x: 1, audio: [{ type: "tts" }] }, { excludeKeys: ["audio"] });
    const b = deterministicHash({ x: 1, audio: [{ type: "file" }] }, { excludeKeys: ["audio"] });
    assert.strictEqual(a, b);
  });

  it("includes suffix in hash computation", () => {
    const a = deterministicHash({ x: 1 }, { suffix: "abc" });
    const b = deterministicHash({ x: 1 }, { suffix: "def" });
    assert.notStrictEqual(a, b);
  });

  it("same object without suffix differs from with suffix", () => {
    const a = deterministicHash({ x: 1 });
    const b = deterministicHash({ x: 1 }, { suffix: "extra" });
    assert.notStrictEqual(a, b);
  });
});
