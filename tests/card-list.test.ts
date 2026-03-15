import { describe, it } from "node:test";
import assert from "node:assert/strict";

// Minimal DOM mock — set up before importing buildCardList
class MockElement {
  tag: string;
  className = "";
  textContent = "";
  style: Record<string, string> = {};
  children: MockElement[] = [];
  _listeners: Record<string, Function[]> = {};
  classList = {
    _el: null as MockElement | null,
    add(cls: string) { if (this._el) this._el.className += (this._el.className ? " " : "") + cls; },
  };

  constructor(tag: string) {
    this.tag = tag;
    this.classList._el = this;
  }

  appendChild(child: MockElement) {
    this.children.push(child);
    return child;
  }

  addEventListener(type: string, fn: Function) {
    if (!this._listeners[type]) this._listeners[type] = [];
    this._listeners[type].push(fn);
  }

  click() {
    for (const fn of this._listeners["click"] || []) fn();
  }
}

(globalThis as any).document = {
  createElement(tag: string) { return new MockElement(tag); },
};

import { buildCardList } from "../ui/card-list.ts";

// Helper to recursively find all elements with a given class
function findByClass(root: MockElement, cls: string): MockElement[] {
  const results: MockElement[] = [];
  function walk(el: MockElement) {
    if (el.className && el.className.split(" ").includes(cls)) results.push(el);
    for (const child of el.children) walk(child);
  }
  walk(root);
  return results;
}

// Helper to find elements by text content (non-recursive, direct children of an element)
function childrenWithText(el: MockElement, text: string): MockElement[] {
  return el.children.filter(c => c.textContent === text);
}

describe("buildCardList", () => {
  // --- Structure tests ---

  it("creates a container div", () => {
    const result = buildCardList({
      items: [],
      addButtonText: "+ Add",
      onChanged: () => {},
      renderItemHeader: () => {},
      renderItemBody: () => {},
      onAdd: () => {},
    }) as unknown as MockElement;
    assert.strictEqual(result.tag, "div");
    assert.strictEqual(result.style.padding, "0 12px 8px");
  });

  it("creates header when headerText is provided", () => {
    const result = buildCardList({
      headerText: "Audio",
      items: [],
      addButtonText: "+ Add",
      onChanged: () => {},
      renderItemHeader: () => {},
      renderItemBody: () => {},
      onAdd: () => {},
    }) as unknown as MockElement;
    const headers = findByClass(result, "prop-group-header");
    assert.strictEqual(headers.length, 1);
    assert.strictEqual(headers[0].textContent, "Audio");
  });

  it("skips header when headerText is omitted", () => {
    const result = buildCardList({
      items: [],
      addButtonText: "+ Add",
      onChanged: () => {},
      renderItemHeader: () => {},
      renderItemBody: () => {},
      onAdd: () => {},
    }) as unknown as MockElement;
    const headers = findByClass(result, "prop-group-header");
    assert.strictEqual(headers.length, 0);
  });

  it("creates a card per item with correct number badges", () => {
    const items = ["a", "b", "c"];
    const result = buildCardList({
      items,
      addButtonText: "+ Add",
      onChanged: () => {},
      renderItemHeader: () => {},
      renderItemBody: () => {},
      onAdd: () => {},
    }) as unknown as MockElement;

    const cards = findByClass(result, "layer-card");
    assert.strictEqual(cards.length, 3);

    const nums = findByClass(result, "layer-num");
    assert.strictEqual(nums.length, 3);
    assert.strictEqual(nums[0].textContent, "1");
    assert.strictEqual(nums[1].textContent, "2");
    assert.strictEqual(nums[2].textContent, "3");
  });

  it("creates add button with correct text", () => {
    const result = buildCardList({
      items: [],
      addButtonText: "+ Add Keyframe",
      onChanged: () => {},
      renderItemHeader: () => {},
      renderItemBody: () => {},
      onAdd: () => {},
    }) as unknown as MockElement;

    const addBtns = findByClass(result, "layers-add-btn");
    assert.strictEqual(addBtns.length, 1);
    assert.strictEqual(addBtns[0].textContent, "+ Add Keyframe");
  });

  it("creates empty list with just an add button", () => {
    const result = buildCardList({
      items: [],
      addButtonText: "+ Add",
      onChanged: () => {},
      renderItemHeader: () => {},
      renderItemBody: () => {},
      onAdd: () => {},
    }) as unknown as MockElement;

    assert.strictEqual(findByClass(result, "layer-card").length, 0);
    assert.strictEqual(findByClass(result, "layers-add-btn").length, 1);
  });

  // --- Reorder tests ---

  it("first card has no up button", () => {
    const result = buildCardList({
      items: ["a", "b", "c"],
      addButtonText: "+ Add",
      onChanged: () => {},
      renderItemHeader: () => {},
      renderItemBody: () => {},
      onAdd: () => {},
    }) as unknown as MockElement;

    const cards = findByClass(result, "layer-card");
    const actions = findByClass(cards[0], "layer-actions")[0];
    assert.strictEqual(childrenWithText(actions, "\u2191").length, 0, "First card should have no up button");
    assert.strictEqual(childrenWithText(actions, "\u2193").length, 1, "First card should have a down button");
  });

  it("last card has no down button", () => {
    const result = buildCardList({
      items: ["a", "b", "c"],
      addButtonText: "+ Add",
      onChanged: () => {},
      renderItemHeader: () => {},
      renderItemBody: () => {},
      onAdd: () => {},
    }) as unknown as MockElement;

    const cards = findByClass(result, "layer-card");
    const actions = findByClass(cards[2], "layer-actions")[0];
    assert.strictEqual(childrenWithText(actions, "\u2191").length, 1, "Last card should have an up button");
    assert.strictEqual(childrenWithText(actions, "\u2193").length, 0, "Last card should have no down button");
  });

  it("middle card has both up and down buttons", () => {
    const result = buildCardList({
      items: ["a", "b", "c"],
      addButtonText: "+ Add",
      onChanged: () => {},
      renderItemHeader: () => {},
      renderItemBody: () => {},
      onAdd: () => {},
    }) as unknown as MockElement;

    const cards = findByClass(result, "layer-card");
    const actions = findByClass(cards[1], "layer-actions")[0];
    assert.strictEqual(childrenWithText(actions, "\u2191").length, 1);
    assert.strictEqual(childrenWithText(actions, "\u2193").length, 1);
  });

  it("single item has no up or down buttons", () => {
    const result = buildCardList({
      items: ["a"],
      addButtonText: "+ Add",
      onChanged: () => {},
      renderItemHeader: () => {},
      renderItemBody: () => {},
      onAdd: () => {},
    }) as unknown as MockElement;

    const cards = findByClass(result, "layer-card");
    const actions = findByClass(cards[0], "layer-actions")[0];
    assert.strictEqual(childrenWithText(actions, "\u2191").length, 0);
    assert.strictEqual(childrenWithText(actions, "\u2193").length, 0);
  });

  it("up button swaps item with previous and calls onChanged", () => {
    const items = ["a", "b", "c"];
    let changed = false;
    const result = buildCardList({
      items,
      addButtonText: "+ Add",
      onChanged: () => { changed = true; },
      renderItemHeader: () => {},
      renderItemBody: () => {},
      onAdd: () => {},
    }) as unknown as MockElement;

    const cards = findByClass(result, "layer-card");
    const actions = findByClass(cards[1], "layer-actions")[0];
    const upBtn = childrenWithText(actions, "\u2191")[0];
    upBtn.click();
    assert.deepStrictEqual(items, ["b", "a", "c"]);
    assert.ok(changed);
  });

  it("down button swaps item with next and calls onChanged", () => {
    const items = ["a", "b", "c"];
    let changed = false;
    const result = buildCardList({
      items,
      addButtonText: "+ Add",
      onChanged: () => { changed = true; },
      renderItemHeader: () => {},
      renderItemBody: () => {},
      onAdd: () => {},
    }) as unknown as MockElement;

    const cards = findByClass(result, "layer-card");
    const actions = findByClass(cards[0], "layer-actions")[0];
    const downBtn = childrenWithText(actions, "\u2193")[0];
    downBtn.click();
    assert.deepStrictEqual(items, ["b", "a", "c"]);
    assert.ok(changed);
  });

  // --- canReorder tests ---

  it("canReorder=false suppresses all up/down buttons", () => {
    const result = buildCardList({
      items: ["a", "b", "c"],
      addButtonText: "+ Add",
      canReorder: false,
      onChanged: () => {},
      renderItemHeader: () => {},
      renderItemBody: () => {},
      onAdd: () => {},
    }) as unknown as MockElement;

    const cards = findByClass(result, "layer-card");
    for (const card of cards) {
      const actions = findByClass(card, "layer-actions")[0];
      assert.strictEqual(childrenWithText(actions, "\u2191").length, 0, "Should have no up buttons");
      assert.strictEqual(childrenWithText(actions, "\u2193").length, 0, "Should have no down buttons");
    }
  });

  it("canReorder=false still has delete buttons", () => {
    const result = buildCardList({
      items: ["a", "b"],
      addButtonText: "+ Add",
      canReorder: false,
      onChanged: () => {},
      renderItemHeader: () => {},
      renderItemBody: () => {},
      onAdd: () => {},
    }) as unknown as MockElement;

    const deleteBtns = findByClass(result, "layer-delete");
    assert.strictEqual(deleteBtns.length, 2);
  });

  // --- Delete tests ---

  it("delete removes item from array (default behavior)", () => {
    const items = ["a", "b", "c"];
    let changed = false;
    const result = buildCardList({
      items,
      addButtonText: "+ Add",
      onChanged: () => { changed = true; },
      renderItemHeader: () => {},
      renderItemBody: () => {},
      onAdd: () => {},
    }) as unknown as MockElement;

    const deleteBtns = findByClass(result, "layer-delete");
    deleteBtns[1].click(); // delete "b"
    assert.deepStrictEqual(items, ["a", "c"]);
    assert.ok(changed);
  });

  it("custom onDelete is called instead of default splice", () => {
    const items = ["a", "b", "c"];
    let deletedIndex = -1;
    const result = buildCardList({
      items,
      addButtonText: "+ Add",
      onChanged: () => {},
      onDelete: (arr, idx) => {
        deletedIndex = idx;
        arr.splice(idx, 1);
      },
      renderItemHeader: () => {},
      renderItemBody: () => {},
      onAdd: () => {},
    }) as unknown as MockElement;

    const deleteBtns = findByClass(result, "layer-delete");
    deleteBtns[1].click();
    assert.strictEqual(deletedIndex, 1);
    assert.deepStrictEqual(items, ["a", "c"]);
  });

  it("onChanged is called after custom onDelete", () => {
    const callOrder: string[] = [];
    const result = buildCardList({
      items: ["a"],
      addButtonText: "+ Add",
      onChanged: () => { callOrder.push("changed"); },
      onDelete: (arr, idx) => { callOrder.push("delete"); arr.splice(idx, 1); },
      renderItemHeader: () => {},
      renderItemBody: () => {},
      onAdd: () => {},
    }) as unknown as MockElement;

    findByClass(result, "layer-delete")[0].click();
    assert.deepStrictEqual(callOrder, ["delete", "changed"]);
  });

  // --- Add tests ---

  it("add button calls onAdd callback", () => {
    let added = false;
    const result = buildCardList({
      items: [],
      addButtonText: "+ Add Layer",
      onChanged: () => {},
      renderItemHeader: () => {},
      renderItemBody: () => {},
      onAdd: () => { added = true; },
    }) as unknown as MockElement;

    findByClass(result, "layers-add-btn")[0].click();
    assert.ok(added);
  });

  // --- Callback invocation tests ---

  it("calls renderItemHeader for each item with correct args", () => {
    const calls: Array<{ item: any; index: number }> = [];
    buildCardList({
      items: ["x", "y"],
      addButtonText: "+ Add",
      onChanged: () => {},
      renderItemHeader: (item, i, header) => {
        calls.push({ item, index: i });
        assert.strictEqual((header as unknown as MockElement).className, "layer-card-header");
      },
      renderItemBody: () => {},
      onAdd: () => {},
    });

    assert.strictEqual(calls.length, 2);
    assert.strictEqual(calls[0].item, "x");
    assert.strictEqual(calls[0].index, 0);
    assert.strictEqual(calls[1].item, "y");
    assert.strictEqual(calls[1].index, 1);
  });

  it("calls renderItemBody for each item with correct args", () => {
    const calls: Array<{ item: any; index: number }> = [];
    buildCardList({
      items: ["x", "y"],
      addButtonText: "+ Add",
      onChanged: () => {},
      renderItemHeader: () => {},
      renderItemBody: (item, i, card) => {
        calls.push({ item, index: i });
        assert.strictEqual((card as unknown as MockElement).className, "layer-card");
      },
      onAdd: () => {},
    });

    assert.strictEqual(calls.length, 2);
    assert.strictEqual(calls[0].item, "x");
    assert.strictEqual(calls[0].index, 0);
    assert.strictEqual(calls[1].item, "y");
    assert.strictEqual(calls[1].index, 1);
  });

  it("header content appended by renderItemHeader appears in card header", () => {
    const result = buildCardList({
      items: ["a"],
      addButtonText: "+ Add",
      onChanged: () => {},
      renderItemHeader: (item, i, header) => {
        const span = document.createElement("span") as unknown as MockElement;
        span.textContent = "custom-header";
        (header as unknown as MockElement).appendChild(span);
      },
      renderItemBody: () => {},
      onAdd: () => {},
    }) as unknown as MockElement;

    const headers = findByClass(result, "layer-card-header");
    const customSpans = headers[0].children.filter(c => c.textContent === "custom-header");
    assert.strictEqual(customSpans.length, 1);
  });

  it("body content appended by renderItemBody appears in card", () => {
    const result = buildCardList({
      items: ["a"],
      addButtonText: "+ Add",
      onChanged: () => {},
      renderItemHeader: () => {},
      renderItemBody: (item, i, card) => {
        const div = document.createElement("div") as unknown as MockElement;
        div.className = "custom-body";
        (card as unknown as MockElement).appendChild(div);
      },
      onAdd: () => {},
    }) as unknown as MockElement;

    const cards = findByClass(result, "layer-card");
    const customBodies = findByClass(cards[0], "custom-body");
    assert.strictEqual(customBodies.length, 1);
  });

  // --- Extra actions tests ---

  it("extraItemActions buttons appear before delete button", () => {
    const result = buildCardList({
      items: ["a"],
      addButtonText: "+ Add",
      onChanged: () => {},
      renderItemHeader: () => {},
      renderItemBody: () => {},
      onAdd: () => {},
      extraItemActions: () => {
        const btn = document.createElement("button") as unknown as MockElement;
        btn.textContent = "Extra";
        return [btn as unknown as HTMLElement];
      },
    }) as unknown as MockElement;

    const actions = findByClass(result, "layer-actions")[0];
    const texts = actions.children.map(c => c.textContent);
    assert.ok(texts.includes("Extra"), "Should contain extra action");
    assert.ok(texts.includes("\u00D7"), "Should contain delete button");
    assert.ok(
      texts.indexOf("Extra") < texts.indexOf("\u00D7"),
      "Extra action should appear before delete"
    );
  });

  it("extraItemActions receives correct item and index", () => {
    const calls: Array<{ item: any; index: number }> = [];
    buildCardList({
      items: ["a", "b"],
      addButtonText: "+ Add",
      onChanged: () => {},
      renderItemHeader: () => {},
      renderItemBody: () => {},
      onAdd: () => {},
      extraItemActions: (item, i) => {
        calls.push({ item, index: i });
        return [];
      },
    });

    assert.strictEqual(calls.length, 2);
    assert.strictEqual(calls[0].item, "a");
    assert.strictEqual(calls[0].index, 0);
    assert.strictEqual(calls[1].item, "b");
    assert.strictEqual(calls[1].index, 1);
  });

  // --- Delete button structure ---

  it("each card has exactly one delete button", () => {
    const result = buildCardList({
      items: ["a", "b", "c"],
      addButtonText: "+ Add",
      onChanged: () => {},
      renderItemHeader: () => {},
      renderItemBody: () => {},
      onAdd: () => {},
    }) as unknown as MockElement;

    const cards = findByClass(result, "layer-card");
    for (const card of cards) {
      const dels = findByClass(card, "layer-delete");
      assert.strictEqual(dels.length, 1);
      assert.strictEqual(dels[0].textContent, "\u00D7");
    }
  });
});
