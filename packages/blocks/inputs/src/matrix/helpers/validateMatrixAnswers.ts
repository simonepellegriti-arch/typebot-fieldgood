import { defaultMatrixInputOptions } from "../constants";
import type { MatrixInputOptions } from "../schema";

export type MatrixAnswersValidation =
  | { status: "valid" }
  | {
      status: "invalid";
      reason:
        | "unknownRow"
        | "unknownColumn"
        | "tooManyColumnsInRow"
        | "missingRequiredRow"
        | "belowMinAnsweredRows"
        | "aboveMaxAnsweredRows";
      rowId?: string;
    };

/**
 * Validates matrix answers (column ids by row id) against the block options.
 * Shared by the web client (send button) and the bot engine.
 */
export const validateMatrixAnswers = ({
  answers,
  options,
}: {
  answers: Record<string, string[]>;
  options: MatrixInputOptions | undefined;
}): MatrixAnswersValidation => {
  const rows = options?.rows ?? [];
  const columns = options?.columns ?? [];
  const answerMode =
    options?.answerMode ?? defaultMatrixInputOptions.answerMode;
  const requiredMode =
    options?.requiredMode ?? defaultMatrixInputOptions.requiredMode;

  const answeredRowIds: string[] = [];
  for (const [rowId, columnIds] of Object.entries(answers)) {
    if (!rows.some((row) => row.id === rowId))
      return { status: "invalid", reason: "unknownRow", rowId };
    if (columnIds.some((columnId) => !columns.some((c) => c.id === columnId)))
      return { status: "invalid", reason: "unknownColumn", rowId };
    if (answerMode === "single" && columnIds.length > 1)
      return { status: "invalid", reason: "tooManyColumnsInRow", rowId };
    if (columnIds.length > 0) answeredRowIds.push(rowId);
  }

  const requiredRows = rows.filter((row) =>
    requiredMode === "all"
      ? true
      : requiredMode === "custom"
        ? Boolean(row.isRequired)
        : false,
  );
  const missingRow = requiredRows.find(
    (row) => !answeredRowIds.includes(row.id),
  );
  if (missingRow)
    return {
      status: "invalid",
      reason: "missingRequiredRow",
      rowId: missingRow.id,
    };

  if (
    options?.minAnsweredRows !== undefined &&
    answeredRowIds.length < options.minAnsweredRows
  )
    return { status: "invalid", reason: "belowMinAnsweredRows" };
  if (
    options?.maxAnsweredRows !== undefined &&
    answeredRowIds.length > options.maxAnsweredRows
  )
    return { status: "invalid", reason: "aboveMaxAnsweredRows" };

  return { status: "valid" };
};
