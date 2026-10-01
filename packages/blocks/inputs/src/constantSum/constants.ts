import type { ConstantSumInputOptions } from "./schema";

export const defaultConstantSumInputOptions = {
  total: 100,
  areItemsRandomized: false,
  totalLabel: "Total",
  buttonLabel: "Send",
} as const satisfies ConstantSumInputOptions;
