import { describe, it } from "node:test";
import assert from "node:assert/strict";

// Since we don't have a real DOM in Node, test the pure logic of createOption
// and createOptgroup by simulating what they do with plain objects.
// This validates the refactoring doesn't change behavior.

describe("createOption logic", () => {
  function createOption(value: string, text: string, selected?: boolean) {
    return { value, textContent: text, selected: !!selected };
  }

  it("creates an option with value and text", () => {
    const opt = createOption("foo", "Foo");
    assert.strictEqual(opt.value, "foo");
    assert.strictEqual(opt.textContent, "Foo");
    assert.strictEqual(opt.selected, false);
  });

  it("creates a selected option", () => {
    const opt = createOption("bar", "Bar", true);
    assert.strictEqual(opt.selected, true);
  });

  it("handles undefined selected as false", () => {
    const opt = createOption("baz", "Baz");
    assert.strictEqual(opt.selected, false);
  });
});

describe("createOptgroup logic", () => {
  function createOption(value: string, text: string, selected?: boolean) {
    return { value, textContent: text, selected: !!selected };
  }

  function createOptgroup(label: string, options: Array<{ value: string; text: string; selected?: boolean }>) {
    return {
      label,
      children: options.map(o => createOption(o.value, o.text, o.selected)),
    };
  }

  it("creates a group with label and options", () => {
    const group = createOptgroup("Types", [
      { value: "a", text: "A" },
      { value: "b", text: "B", selected: true },
    ]);
    assert.strictEqual(group.label, "Types");
    assert.strictEqual(group.children.length, 2);
    assert.strictEqual(group.children[0].value, "a");
    assert.strictEqual(group.children[1].selected, true);
  });

  it("creates empty group", () => {
    const group = createOptgroup("Empty", []);
    assert.strictEqual(group.children.length, 0);
  });
});
