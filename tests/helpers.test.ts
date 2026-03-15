import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildTextAlignmentExpr, buildFadeFilter } from "../types/_helpers.ts";

describe("buildTextAlignmentExpr", () => {
  it("returns center/middle expressions", () => {
    const { xExpr, yExpr } = buildTextAlignmentExpr("center", "middle");
    assert.strictEqual(xExpr, "((w-text_w)/2)");
    assert.strictEqual(yExpr, "((h-text_h)/2)");
  });

  it("returns left/top expressions", () => {
    const { xExpr, yExpr } = buildTextAlignmentExpr("left", "top");
    assert.strictEqual(xExpr, "50");
    assert.strictEqual(yExpr, "50");
  });

  it("returns right/bottom expressions", () => {
    const { xExpr, yExpr } = buildTextAlignmentExpr("right", "bottom");
    assert.strictEqual(xExpr, "(w-text_w-50)");
    assert.strictEqual(yExpr, "(h-text_h-50)");
  });
});

describe("buildFadeFilter", () => {
  it("returns empty string when no fade", () => {
    const result = buildFadeFilter({ type: "caption" }, 3);
    assert.strictEqual(result, "");
  });

  it("returns fade-in filter", () => {
    const result = buildFadeFilter({ type: "caption", "fade-in": 0.5 }, 3);
    assert.strictEqual(result, ",fade=t=in:st=0:d=0.5");
  });

  it("returns fade-out filter", () => {
    const result = buildFadeFilter({ type: "caption", "fade-out": 0.5 }, 3);
    assert.strictEqual(result, ",fade=t=out:st=2.500:d=0.5");
  });

  it("returns both fade-in and fade-out", () => {
    const result = buildFadeFilter({ type: "caption", "fade-in": 0.5, "fade-out": 1 }, 5);
    assert.strictEqual(result, ",fade=t=in:st=0:d=0.5,fade=t=out:st=4.000:d=1");
  });

  it("filter string starts with comma for chaining", () => {
    const result = buildFadeFilter({ type: "caption", "fade-in": 1 }, 3);
    assert.ok(result.startsWith(","));
  });
});
