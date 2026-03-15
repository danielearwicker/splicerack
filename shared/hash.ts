import { createHash } from "crypto";

export function deterministicHash(
  obj: unknown,
  { excludeKeys = [], suffix = "" }: { excludeKeys?: string[]; suffix?: string } = {}
): string {
  const exclude = new Set(excludeKeys);
  const json = JSON.stringify(obj, (key: string, value: unknown) => {
    if (exclude.has(key)) return undefined;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const sorted: Record<string, unknown> = {};
      for (const k of Object.keys(value).sort()) sorted[k] = (value as Record<string, unknown>)[k];
      return sorted;
    }
    return value;
  });
  return createHash("sha256").update(json + suffix).digest("hex").slice(0, 16);
}
