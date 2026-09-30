import type { MatrixInputOptions } from "../schema";

/**
 * Selection rule of a matrix cell.
 * single: one column per row (clicking another column replaces it, clicking the same keeps it).
 * multiple: columns are toggled independently.
 */
export const toggleMatrixSelection = ({
  answers,
  rowId,
  columnId,
  answerMode,
}: {
  answers: Record<string, string[]>;
  rowId: string;
  columnId: string;
  answerMode: NonNullable<MatrixInputOptions["answerMode"]>;
}): Record<string, string[]> => {
  const rowSelection = answers[rowId] ?? [];
  if (answerMode === "single") return { ...answers, [rowId]: [columnId] };
  const newRowSelection = rowSelection.includes(columnId)
    ? rowSelection.filter((selectedId) => selectedId !== columnId)
    : [...rowSelection, columnId];
  const { [rowId]: _removedRow, ...otherRows } = answers;
  return newRowSelection.length > 0
    ? { ...otherRows, [rowId]: newRowSelection }
    : otherRows;
};
