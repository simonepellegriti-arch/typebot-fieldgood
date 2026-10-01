import {
  blockBaseSchema,
  optionBaseSchema,
} from "@typebot.io/blocks-base/schemas";
import { z } from "zod";
import { InputBlockType } from "../constants";

/**
 * A statement rated with its own slider. `value` is the stable code used in
 * exports (D5_<value>); `label` is only what respondents see.
 */
export const sliderStatementSchema = z.object({
  id: z.string(),
  label: z.string().optional(),
  value: z.string().optional(),
  /** Optional variable receiving this statement's value. */
  variableId: z.string().optional(),
});

export const sliderInputOptionsSchema = optionBaseSchema.extend({
  question: z.string().optional(),
  /** No statement: a single slider for the question. Several: one slider each. */
  rows: z.array(sliderStatementSchema).optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().positive().optional(),
  /** Initial thumb position; defaults to the middle of the scale. */
  startValue: z.number().optional(),
  minLabel: z.string().optional(),
  middleLabel: z.string().optional(),
  maxLabel: z.string().optional(),
  /** Shown next to the value, e.g. "%". Exports keep the plain number. */
  unit: z.string().optional(),
  isValueVisible: z.boolean().optional(),
  /** Each slider must be moved before sending (avoids answers stuck on the start value). */
  isInteractionRequired: z.boolean().optional(),
  areRowsRandomized: z.boolean().optional(),
  buttonLabel: z.string().optional(),
});

export const sliderInputSchema = blockBaseSchema.merge(
  z.object({
    type: z.enum([InputBlockType.SLIDER]),
    options: sliderInputOptionsSchema.optional(),
  }),
);

/** Structured reply of the web client: value by statement id. */
export const sliderStructuredReplySchema = z.object({
  type: z.literal("slider"),
  values: z.record(z.string(), z.number()),
});

export type SliderStatement = z.infer<typeof sliderStatementSchema>;
export type SliderInputOptions = z.infer<typeof sliderInputOptionsSchema>;
export type SliderInputBlock = z.infer<typeof sliderInputSchema>;
export type SliderStructuredReply = z.infer<typeof sliderStructuredReplySchema>;
