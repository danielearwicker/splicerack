import { readdirSync, statSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function loadTypes() {
  const registry = new Map();
  const entries = readdirSync(__dirname)
    .filter(f => !f.startsWith("_") && !f.startsWith(".") && !f.endsWith(".js"))
    .filter(f => statSync(join(__dirname, f)).isDirectory());

  for (const dir of entries) {
    const serverPath = join(__dirname, dir, "server.js");
    const mod = await import(pathToFileURL(serverPath).href);
    const renderer = mod.default;
    if (renderer && renderer.type && typeof renderer.render === "function") {
      registry.set(renderer.type, renderer);
    }
  }
  return registry;
}
