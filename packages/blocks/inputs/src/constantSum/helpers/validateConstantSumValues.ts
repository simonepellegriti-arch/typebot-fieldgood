import { defaultConstantSumInputOptions } from "../constants";
import type { ConstantSumInputOptions } from "../schema";

export type ConstantSumValuesValidation =
  | { status: "valid"; sum: number }
  | {
      status: "invalid";
      reason: "unknownItem" | "notAWholeNumber" | "negative" | "wrongTotal";
      sum: number;
      itemId?: string;
    };

/**
 * Amounts are whole numbers >= 0 and add up exactly to the total. Categories
 * left empty count as 0. Shared by the web client and the bot engine.
 */
export const validateConstantSumValues = ({
  values,
  options,
}: {
  values: Record<string, number>;
  options: ConstantSumInputOptions | undefined;
}): ConstantSumValuesValidation => {
  const items = options?.items ?? [];
  const total = options?.total ?? defaultConstantSumInputOptions.total;
  let sum = 0;
  for (const [itemId, amount] of Object.entries(values)) {
    if (!items.some((item) => item.id === itemId))
      return { status: "invalid", reason: "unknownItem", sum, itemId };
    if (!Number.isInteger(amount))
      return { status: "invalid", reason: "notAWholeNumber", sum, itemId };
    if (amount < 0)
      return { status: "invalid", reason: "negative", sum, itemId };
    sum += amount;
  }
  if (sum !== total) return { status: "invalid", reason: "wrongTotal", sum };
  return { status: "valid", sum };
};
