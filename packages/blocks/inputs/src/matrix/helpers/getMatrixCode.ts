import type { MatrixColumn, MatrixRow } from "../schema";

/**
 * Stable code of a row or column: its configured value, or its 1-based position
 * in the builder order when no value was set. Display order (randomization) never
 * changes codes.
 */
export const getMatrixCode = (
  entry: Pick<MatrixRow | MatrixColumn, "value">,
  builderIndex: number,
): string => entry.value?.trim() || String(builderIndex + 1);
