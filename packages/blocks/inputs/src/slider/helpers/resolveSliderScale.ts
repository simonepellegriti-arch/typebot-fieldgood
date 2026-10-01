import { defaultSliderInputOptions } from "../constants";
import type { SliderInputOptions } from "../schema";

/** Scale of a slider with defaults applied (min < max, step > 0, start inside the scale). */
export const resolveSliderScale = (options: SliderInputOptions | undefined) => {
  const configuredMin = options?.min ?? defaultSliderInputOptions.min;
  const configuredMax = options?.max ?? defaultSliderInputOptions.max;
  const min = Math.min(configuredMin, configuredMax);
  const max = Math.max(configuredMin, configuredMax);
  const step =
    options?.step && options.step > 0
      ? options.step
      : defaultSliderInputOptions.step;
  const middle = min + Math.round((max - min) / 2 / step) * step;
  const startValue = clamp(options?.startValue ?? middle, min, max);
  return { min, max, step, startValue };
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));
