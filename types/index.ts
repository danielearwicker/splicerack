import { readdirSync, statSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import type { SegmentRenderer } from "../shared/types.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function loadTypes(): Promise<Map<string, SegmentRenderer>> {
  const registry = new Map<string, SegmentRenderer>();
  const entries = readdirSync(__dirname)
    .filter(f => !f.startsWith("_") && !f.startsWith(".") && !f.endsWith(".js") && !f.endsWith(".ts"))
    .filter(f => statSync(join(__dirname, f)).isDirectory());

  for (const dir of entries) {
    const serverPath = join(__dirname, dir, "server.ts");
    const mod = await import(pathToFileURL(serverPath).href);
    const renderer = mod.default as SegmentRenderer;
    if (renderer && renderer.type && typeof renderer.render === "function") {
      registry.set(renderer.type, renderer);
    }
  }
  return registry;
}
