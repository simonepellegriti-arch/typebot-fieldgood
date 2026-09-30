import {
  defaultMatrixInputOptions,
  matrixCardsLayoutBreakpoint,
  matrixMinColumnWidth,
} from "../constants";
import type { MatrixInputOptions } from "../schema";

/**
 * Chooses how the matrix is displayed. In "auto" mode a table is used only when
 * every column can get a usable width; otherwise (smartphones, many columns)
 * each row becomes a separate card. The data structure is the same in both layouts.
 */
export const resolveMatrixLayout = ({
  layout,
  containerWidth,
  columnCount,
}: {
  layout: MatrixInputOptions["layout"];
  containerWidth: number;
  columnCount: number;
}): "table" | "cards" => {
  const resolvedLayout = layout ?? defaultMatrixInputOptions.layout;
  if (resolvedLayout !== "auto") return resolvedLayout;
  const rowLabelWidth = 140;
  const neededWidth = rowLabelWidth + columnCount * matrixMinColumnWidth;
  return containerWidth >= matrixCardsLayoutBreakpoint &&
    containerWidth >= neededWidth
    ? "table"
    : "cards";
};
