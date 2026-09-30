import { defaultLoopOptions, maxLoopIterations } from "./constants";
import type { LoopOptions } from "./schema";

/**
 * Resolves the items of a loop from its options and the current value of its
 * source variable. Items are strings (they are exposed as the current item variable).
 * - list / answers: array values, JSON arrays, or text split on new lines, "|" or ", ".
 * - count: 1..N (N from the count variable when set, else the fixed count).
 */
export const parseLoopItems = (
  options: LoopOptions | undefined,
  sourceValue: unknown,
): string[] => {
  const sourceType = options?.sourceType ?? defaultLoopOptions.sourceType;
  if (sourceType === "count") {
    const countText =
      options?.sourceVariableId !== undefined &&
      sourceValue !== undefined &&
      sourceValue !== null
        ? String(sourceValue).trim().replace(",", ".")
        : "";
    // An empty count variable falls back to the fixed count (not 0 iterations).
    const countFromVariable = countText ? Number(countText) : Number.NaN;
    const count = Number.isFinite(countFromVariable)
      ? Math.floor(countFromVariable)
      : (options?.count ?? defaultLoopOptions.count);
    const boundedCount = Math.max(0, Math.min(count, maxLoopIterations));
    return Array.from({ length: boundedCount }, (_, index) =>
      String(index + 1),
    );
  }
  return toItemList(sourceValue).slice(0, maxLoopIterations);
};

const toItemList = (value: unknown): string[] => {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value))
    return value
      .filter((item) => item !== null && item !== undefined)
      .map((item) => String(item).trim())
      .filter(Boolean);
  const text = String(value).trim();
  if (!text) return [];
  if (text.startsWith("[")) {
    try {
      const parsedJson: unknown = JSON.parse(text);
      if (Array.isArray(parsedJson)) return toItemList(parsedJson);
    } catch {
      // Not JSON: fall back to separators.
    }
  }
  const separator = text.includes("\n")
    ? /\r?\n/
    : text.includes("|")
      ? /\|/
      : /,\s+/;
  return text
    .split(separator)
    .map((item) => item.trim())
    .filter(Boolean);
};
