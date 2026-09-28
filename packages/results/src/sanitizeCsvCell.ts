import { isNumericLiteral } from "./research/coerceResearchValue";

const formulaPrefixes = ["=", "+", "-", "@", "\t", "\r"];

/**
 * Protects exported CSV cells against formula injection.
 * Only applied while generating the CSV: stored data is never modified.
 * Numeric literals (`-5`, `+393401234567`) are not formulas and are left untouched.
 */
export const sanitizeCsvCell = <T extends string | undefined | null>(
  value: T,
): T extends string ? string : T => {
  if (typeof value !== "string" || value.length === 0)
    return value as T extends string ? string : T;
  return (
    formulaPrefixes.includes(value[0]!) && !isNumericLiteral(value)
      ? `'${value}`
      : value
  ) as T extends string ? string : T;
};
