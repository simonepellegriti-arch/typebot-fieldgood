import type { SliderInputOptions } from "../schema";
import { getSliderRows } from "./getSliderRows";
import { resolveSliderScale } from "./resolveSliderScale";

export type SliderValuesValidation =
  | { status: "valid" }
  | {
      status: "invalid";
      reason: "missingValue" | "unknownRow" | "outOfScale" | "offStep";
      rowId?: string;
    };

/**
 * Every displayed statement has a value inside the scale and on a step.
 * Shared by the web client (send button) and the bot engine.
 */
export const validateSliderValues = ({
  values,
  options,
}: {
  values: Record<string, number>;
  options: SliderInputOptions | undefined;
}): SliderValuesValidation => {
  const rows = getSliderRows(options);
  const { min, max, step } = resolveSliderScale(options);
  for (const rowId of Object.keys(values))
    if (!rows.some((row) => row.id === rowId))
      return { status: "invalid", reason: "unknownRow", rowId };
  for (const row of rows) {
    const value = values[row.id];
    if (value === undefined || !Number.isFinite(value))
      return { status: "invalid", reason: "missingValue", rowId: row.id };
    if (value < min || value > max)
      return { status: "invalid", reason: "outOfScale", rowId: row.id };
    const stepsFromMin = (value - min) / step;
    if (Math.abs(stepsFromMin - Math.round(stepsFromMin)) > 1e-6)
      return { status: "invalid", reason: "offStep", rowId: row.id };
  }
  return { status: "valid" };
};
