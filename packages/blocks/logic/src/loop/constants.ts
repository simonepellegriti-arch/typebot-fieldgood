import type { LoopOptions } from "./schema";

export const defaultLoopOptions = {
  sourceType: "list",
  count: 3,
} as const satisfies LoopOptions;

/** Safety net against runaway loops (e.g. a huge list variable). */
export const maxLoopIterations = 1000;
