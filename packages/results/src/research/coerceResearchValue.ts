import type { VariableDataType } from "@typebot.io/variables/schemas";
import type { AnswerResearchValue } from "../schemas/answers";

/**
 * Converts a raw answer value to the declared variable data type.
 * Never loses information: when a value can't be converted it is kept as a string.
 */
export const coerceResearchValue = (
  rawValue: unknown,
  dataType: VariableDataType | undefined,
): AnswerResearchValue | null => {
  if (rawValue === null || rawValue === undefined) return null;
  switch (dataType) {
    case "number":
      return Array.isArray(rawValue)
        ? coerceToNumberList(rawValue)
        : coerceToNumber(rawValue);
    case "number[]":
      return coerceToNumberList(toList(rawValue));
    case "string[]":
      return toList(rawValue).map((item) => String(item));
    case "boolean":
      return coerceToBoolean(rawValue);
    case "datetime":
      return coerceToIsoDatetime(rawValue);
    case "string":
      return Array.isArray(rawValue)
        ? rawValue.map((item) => String(item))
        : String(rawValue);
    case undefined:
      return keepAsResearchValue(rawValue);
  }
};

const numericLiteralRegex = /^[+-]?(\d+([.,]\d+)?|[.,]\d+)([eE][+-]?\d+)?$/;

export const isNumericLiteral = (value: string) =>
  numericLiteralRegex.test(value.trim());

export const parseNumericLiteral = (value: string): number | undefined => {
  if (!isNumericLiteral(value)) return;
  const parsedNumber = Number(value.trim().replace(",", "."));
  return Number.isFinite(parsedNumber) ? parsedNumber : undefined;
};

const coerceToNumber = (rawValue: unknown): number | string => {
  if (typeof rawValue === "number") return rawValue;
  const stringValue = String(rawValue);
  return parseNumericLiteral(stringValue) ?? stringValue;
};

const coerceToNumberList = (rawValues: unknown[]): number[] | string[] => {
  const parsedNumbers = rawValues.map((rawValue) =>
    typeof rawValue === "number"
      ? rawValue
      : parseNumericLiteral(String(rawValue)),
  );
  const definedNumbers = parsedNumbers.filter(
    (parsedNumber): parsedNumber is number => parsedNumber !== undefined,
  );
  if (definedNumbers.length === rawValues.length) return definedNumbers;
  return rawValues.map((rawValue) => String(rawValue));
};

const trueLiterals = ["true", "1", "yes", "si", "sì", "y"];
const falseLiterals = ["false", "0", "no", "n"];

const coerceToBoolean = (rawValue: unknown): boolean | string => {
  if (typeof rawValue === "boolean") return rawValue;
  const normalizedValue = String(rawValue).trim().toLowerCase();
  if (trueLiterals.includes(normalizedValue)) return true;
  if (falseLiterals.includes(normalizedValue)) return false;
  return String(rawValue);
};

const coerceToIsoDatetime = (rawValue: unknown): string => {
  if (rawValue instanceof Date) return rawValue.toISOString();
  const stringValue = String(rawValue);
  const parsedDate = new Date(stringValue);
  return Number.isNaN(parsedDate.getTime())
    ? stringValue
    : parsedDate.toISOString();
};

const toList = (rawValue: unknown): unknown[] =>
  Array.isArray(rawValue) ? rawValue : [rawValue];

const keepAsResearchValue = (rawValue: unknown): AnswerResearchValue => {
  if (
    typeof rawValue === "string" ||
    typeof rawValue === "number" ||
    typeof rawValue === "boolean"
  )
    return rawValue;
  if (Array.isArray(rawValue)) {
    const numberItems = rawValue.filter(
      (item): item is number => typeof item === "number",
    );
    if (numberItems.length === rawValue.length) return numberItems;
    return rawValue.map((item) => String(item));
  }
  return String(rawValue);
};
