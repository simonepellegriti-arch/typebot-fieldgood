import type { DictionaryQuestion } from "./schemas";

/** Same column name as the wide export for a matrix row (D10_1, D10_QUALITY...). */
export const getMatrixLongQuestionName = (
  question: DictionaryQuestion,
  rowCode: string,
): string => {
  const rowIndex = (question.matrixRows ?? []).findIndex(
    (row) => String(row.value) === rowCode,
  );
  const suffix =
    /^[A-Za-z0-9]+$/.test(rowCode) && rowCode.length <= 16
      ? rowCode
      : String(Math.max(rowIndex, 0) + 1);
  return `${question.variableName}_${suffix}`;
};
