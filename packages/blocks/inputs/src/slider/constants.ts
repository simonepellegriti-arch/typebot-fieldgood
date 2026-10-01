import type { SliderInputOptions } from "./schema";

export const defaultSliderInputOptions = {
  min: -100,
  max: 100,
  step: 1,
  isValueVisible: true,
  isInteractionRequired: true,
  areRowsRandomized: false,
  buttonLabel: "Send",
} as const satisfies SliderInputOptions;

/** Id of the implicit statement of a slider without statements (the question itself). */
export const singleSliderRowId = "slider";
