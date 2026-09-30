import type { MatrixInputOptions } from "./schema";

export const defaultMatrixInputOptions = {
  answerMode: "single",
  requiredMode: "all",
  areRowsRandomized: false,
  areColumnsRandomized: false,
  layout: "auto",
  buttonLabel: "Send",
} as const satisfies MatrixInputOptions;

/** Below this container width (px) the "auto" layout shows one card per row. */
export const matrixCardsLayoutBreakpoint = 520;
/** Width needed per column in table layout, used together with the breakpoint. */
export const matrixMinColumnWidth = 72;
