import { getMatrixCode } from "@typebot.io/blocks-inputs/matrix/helpers/getMatrixCode";

/**
 * Text replies of API / WhatsApp clients for questions with several numeric
 * entries (sliders, constant sum): a JSON object {"<entry>": 40} or
 * "entry=40" pairs separated by commas, semicolons or line breaks.
 * Entries can be referenced by code, label or id. Returns numbers by entry id.
 */
export const parseKeyedNumbers = (
  text: string,
  entries: { id: string; label?: string; value?: string }[],
): Record<string, number> | undefined => {
  const pairs = parseJsonPairs(text) ?? parseTextPairs(text);
  if (!pairs || pairs.length === 0) return;
  const numbersById: Record<string, number> = {};
  for (const [key, rawValue] of pairs) {
    const trimmedKey = key.trim();
    const entryIndex = entries.findIndex(
      (entry, index) =>
        entry.id === trimmedKey ||
        getMatrixCode(entry, index) === trimmedKey ||
        entry.label?.trim().toLowerCase() === trimmedKey.toLowerCase(),
    );
    const entry = entries[entryIndex];
    if (!entry) return;
    const value = Number(String(rawValue).trim().replace(",", "."));
    if (!Number.isFinite(value)) return;
    numbersById[entry.id] = value;
  }
  return numbersById;
};

const parseJsonPairs = (text: string): [string, unknown][] | undefined => {
  try {
    const parsedJson: unknown = JSON.parse(text);
    if (
      parsedJson &&
      typeof parsedJson === "object" &&
      !Array.isArray(parsedJson)
    )
      return Object.entries(parsedJson);
  } catch {
    return;
  }
};

const parseTextPairs = (text: string): [string, string][] | undefined => {
  const pairs: [string, string][] = [];
  for (const pair of text
    .split(/[;\n]+|,(?=\s*[^,=]+=)/)
    .map((part) => part.trim())
    .filter(Boolean)) {
    const [key, value, ...rest] = pair.split("=");
    if (key === undefined || value === undefined || rest.length > 0) return;
    pairs.push([key, value]);
  }
  return pairs;
};
