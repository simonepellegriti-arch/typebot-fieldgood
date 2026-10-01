import { singleSliderRowId } from "../constants";
import type { SliderInputOptions, SliderStatement } from "../schema";

/**
 * Statements actually displayed: the configured ones, or a single implicit
 * statement (the question) when there is none.
 */
export const getSliderRows = (
  options: SliderInputOptions | undefined,
): SliderStatement[] => {
  const rows = options?.rows ?? [];
  return rows.length > 0 ? rows : [{ id: singleSliderRowId }];
};
