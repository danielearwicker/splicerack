import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import yaml from "js-yaml";

/** Load and parse a YAML file. Returns { raw, parsed } on success, { raw, error } on parse failure. */
export function loadYamlFile(filePath: string): { raw: string; parsed: any; error?: string } {
  const raw = readFileSync(filePath, "utf-8");
  try {
    return { raw, parsed: yaml.load(raw) };
  } catch (err) {
    return { raw, parsed: null, error: (err as Error).message };
  }
}

/** List files in a directory that match the given extensions (e.g. [".yaml", ".yml"]). */
export function listFilesByExt(dir: string, extensions: string[]): string[] {
  return readdirSync(dir).filter(f => extensions.some(ext => f.endsWith(ext)));
}
