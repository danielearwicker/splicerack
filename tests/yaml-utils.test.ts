import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { loadYamlFile, listFilesByExt } from "../shared/yaml-utils.ts";

const TEST_DIR = join(import.meta.dirname!, "_test_yaml_tmp");

function setup() {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
  mkdirSync(TEST_DIR, { recursive: true });
}

function teardown() {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
}

describe("loadYamlFile", () => {
  it("loads and parses a valid YAML file", () => {
    setup();
    try {
      const filePath = join(TEST_DIR, "test.yaml");
      writeFileSync(filePath, "output:\n  width: 1920\n  height: 1080\ntimeline:\n  - type: caption\n    text: hello\n");

      const { raw, parsed, error } = loadYamlFile(filePath);

      assert.ok(raw.includes("width: 1920"));
      assert.strictEqual(error, undefined);
      assert.strictEqual(parsed.output.width, 1920);
      assert.strictEqual(parsed.output.height, 1080);
      assert.strictEqual(parsed.timeline[0].type, "caption");
      assert.strictEqual(parsed.timeline[0].text, "hello");
    } finally {
      teardown();
    }
  });

  it("returns raw string and error when YAML is invalid", () => {
    setup();
    try {
      const filePath = join(TEST_DIR, "bad.yaml");
      writeFileSync(filePath, "this:\n  is: [broken\n  yaml");

      const { raw, parsed, error } = loadYamlFile(filePath);

      assert.ok(raw.includes("broken"));
      assert.strictEqual(parsed, null);
      assert.ok(typeof error === "string" && error.length > 0);
    } finally {
      teardown();
    }
  });

  it("loads template YAML files (single object, no timeline)", () => {
    setup();
    try {
      const filePath = join(TEST_DIR, "tmpl.yaml");
      writeFileSync(filePath, 'type: caption\nduration: 3\nstyle:\n  font-size: 48\n  color: "#ffffff"\n');

      const { parsed } = loadYamlFile(filePath);

      assert.strictEqual(parsed.type, "caption");
      assert.strictEqual(parsed.duration, 3);
      assert.strictEqual(parsed.style["font-size"], 48);
      assert.strictEqual(parsed.style.color, "#ffffff");
    } finally {
      teardown();
    }
  });
});

describe("listFilesByExt", () => {
  it("filters files by extension", () => {
    setup();
    try {
      writeFileSync(join(TEST_DIR, "a.mp4"), "");
      writeFileSync(join(TEST_DIR, "b.txt"), "");
      writeFileSync(join(TEST_DIR, "c.mp4"), "");
      writeFileSync(join(TEST_DIR, "d.yaml"), "");

      const mp4s = listFilesByExt(TEST_DIR, [".mp4"]);
      assert.deepStrictEqual(mp4s.sort(), ["a.mp4", "c.mp4"]);

      const yamls = listFilesByExt(TEST_DIR, [".yaml", ".yml"]);
      assert.deepStrictEqual(yamls, ["d.yaml"]);
    } finally {
      teardown();
    }
  });

  it("returns empty array when no matches", () => {
    setup();
    try {
      writeFileSync(join(TEST_DIR, "a.txt"), "");
      const result = listFilesByExt(TEST_DIR, [".mp4"]);
      assert.deepStrictEqual(result, []);
    } finally {
      teardown();
    }
  });

  it("supports multiple extensions", () => {
    setup();
    try {
      writeFileSync(join(TEST_DIR, "a.yaml"), "");
      writeFileSync(join(TEST_DIR, "b.yml"), "");
      writeFileSync(join(TEST_DIR, "c.json"), "");

      const result = listFilesByExt(TEST_DIR, [".yaml", ".yml"]);
      assert.deepStrictEqual(result.sort(), ["a.yaml", "b.yml"]);
    } finally {
      teardown();
    }
  });
});
