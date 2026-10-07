import type { AnswerColumn } from "./getAnswerColumns";

/**
 * Airtable header of each answer column from the short question titles
 * ("Lavoro e stile di vita", "Lavoro e stile di vita – trascrizione"…).
 * Headers set before (or edited by the researcher) are kept; two questions
 * with the same title get their code in brackets, and every header stays
 * unique, also against the standard and list columns.
 */
export const buildColumnHeaders = ({
  columns,
  titlesByQuestion,
  currentHeaders,
  reservedHeaders,
}: {
  columns: AnswerColumn[];
  /** Short title per question code (baseName). */
  titlesByQuestion: Map<string, string>;
  /** variable → header already in use. */
  currentHeaders: Record<string, string>;
  reservedHeaders: string[];
}) => {
  const titleOf = (baseName: string) =>
    cleanHeader(titlesByQuestion.get(baseName) ?? "") || baseName;
  const basesByTitle = new Map<string, Set<string>>();
  for (const column of columns) {
    const key = titleOf(column.baseName).toLowerCase();
    basesByTitle.set(
      key,
      (basesByTitle.get(key) ?? new Set()).add(column.baseName),
    );
  }
  const used = new Set(reservedHeaders.map((header) => header.toLowerCase()));
  const headers: Record<string, string> = {};
  const unique = (header: string, fallbackSuffix: string) => {
    let candidate = header;
    if (used.has(candidate.toLowerCase()))
      candidate = `${header} (${fallbackSuffix})`;
    for (let index = 2; used.has(candidate.toLowerCase()); index++)
      candidate = `${header} (${fallbackSuffix} ${index})`;
    used.add(candidate.toLowerCase());
    return candidate;
  };
  // Kept headers first, so new ones never take their names.
  for (const column of columns) {
    const current = cleanHeader(currentHeaders[column.variableName] ?? "");
    if (current && !used.has(current.toLowerCase())) {
      headers[column.variableName] = current;
      used.add(current.toLowerCase());
    }
  }
  for (const column of columns) {
    if (headers[column.variableName]) continue;
    const title = titleOf(column.baseName);
    const isShared =
      (basesByTitle.get(title.toLowerCase())?.size ?? 0) > 1 &&
      title !== column.baseName;
    const questionTitle = isShared ? `${title} (${column.baseName})` : title;
    headers[column.variableName] = unique(
      `${questionTitle}${suffixOf(column)}`,
      column.variableName,
    );
  }
  // In flow order, like the columns.
  return Object.fromEntries(
    columns.map((column) => [
      column.variableName,
      headers[column.variableName] ?? column.variableName,
    ]),
  );
};

const suffixOf = (column: AnswerColumn) => {
  const round = column.round ? ` – rilancio ${column.round}` : "";
  switch (column.kind) {
    case "answer":
      return round;
    case "audio":
      return round ? `${round} audio` : " – audio";
    case "transcription":
      return round ? `${round} trascrizione` : " – trascrizione";
    case "video":
      return round ? `${round} video` : " – video";
    case "watch":
      return " – visione video (%)";
  }
};

/** Airtable field names: one line, no outer spaces, reasonable length. */
export const cleanHeader = (header: string) =>
  header.replace(/\s+/g, " ").trim().slice(0, 90);
