export function deepMerge(
  base: Record<string, unknown>,
  override: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of new Set([...Object.keys(base), ...Object.keys(override)])) {
    const bVal = base[key];
    const oVal = override[key];
    if (key === "type") {
      result[key] = bVal;
    } else if (oVal === undefined) {
      result[key] = bVal;
    } else if (bVal && typeof bVal === "object" && !Array.isArray(bVal) &&
               oVal && typeof oVal === "object" && !Array.isArray(oVal)) {
      result[key] = deepMerge(bVal as Record<string, unknown>, oVal as Record<string, unknown>);
    } else {
      result[key] = oVal;
    }
  }
  return result;
}
