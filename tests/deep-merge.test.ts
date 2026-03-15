import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { deepMerge } from "../shared/deep-merge.ts";

describe("deepMerge", () => {
  it("merges flat objects", () => {
    const result = deepMerge(
      { a: 1, b: 2 },
      { b: 3, c: 4 },
    );
    assert.deepStrictEqual(result, { a: 1, b: 3, c: 4 });
  });

  it("preserves base type over override type", () => {
    const result = deepMerge(
      { type: "caption", text: "hello" },
      { type: "my-caption", text: "world" },
    );
    assert.strictEqual(result.type, "caption");
    assert.strictEqual(result.text, "world");
  });

  it("deep-merges nested objects", () => {
    const result = deepMerge(
      { style: { color: "#fff", "font-size": 48 } },
      { style: { color: "#000" } },
    );
    assert.deepStrictEqual(result.style, { color: "#000", "font-size": 48 });
  });

  it("override undefined values fall back to base", () => {
    const result = deepMerge(
      { a: 1, b: 2 },
      { a: undefined },
    );
    assert.strictEqual(result.a, 1);
    assert.strictEqual(result.b, 2);
  });

  it("arrays in override replace arrays in base", () => {
    const result = deepMerge(
      { items: [1, 2, 3] },
      { items: [4, 5] },
    );
    assert.deepStrictEqual(result.items, [4, 5]);
  });

  it("handles empty base", () => {
    const result = deepMerge({}, { a: 1 });
    assert.deepStrictEqual(result, { a: 1 });
  });

  it("handles empty override", () => {
    const result = deepMerge({ a: 1 }, {});
    assert.deepStrictEqual(result, { a: 1 });
  });

  it("template + segment scenario: template provides defaults, segment overrides", () => {
    const template = {
      type: "caption",
      duration: 3,
      style: { "font-size": 48, color: "#ffffff", background: "#1a1a2e" },
      "fade-in": 0.5,
    };
    const segment = {
      type: "my-title",
      text: "Hello World",
      style: { color: "#ff0000" },
    };
    const result = deepMerge(template, segment);
    assert.strictEqual(result.type, "caption");
    assert.strictEqual(result.text, "Hello World");
    assert.strictEqual(result.duration, 3);
    assert.strictEqual((result.style as any).color, "#ff0000");
    assert.strictEqual((result.style as any)["font-size"], 48);
    assert.strictEqual(result["fade-in"], 0.5);
  });
});
