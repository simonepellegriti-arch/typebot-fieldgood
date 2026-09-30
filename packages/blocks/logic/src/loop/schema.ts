import { blockBaseSchema } from "@typebot.io/blocks-base/schemas";
import { conditionSchema } from "@typebot.io/conditions/schemas";
import { z } from "zod";
import { LogicBlockType } from "../constants";

/**
 * Runs a group of blocks once per item. The body group must end without an
 * outgoing edge: the flow then comes back to the loop block, which moves to the
 * next item, and leaves through its own outgoing edge after the last one.
 */
export const loopOptionsSchema = z.object({
  /**
   * list: items of a list variable (or a text separated by commas / new lines).
   * answers: values selected in a previous (multiple choice) question, through its variable.
   * count: a fixed number of iterations, or a number read from a variable.
   */
  sourceType: z.enum(["list", "answers", "count"]).optional(),
  /** list / count: variable holding the items (or the number of iterations). */
  sourceVariableId: z.string().optional(),
  /**
   * answers: the (multiple) choice question whose selected options are looped on.
   * Items are the option codes; the current item variable receives their labels.
   */
  sourceBlockId: z.string().optional(),
  /** count mode: fixed number of iterations when no count variable is set. */
  count: z.number().int().min(0).max(1000).optional(),
  /** Group executed at each iteration. */
  bodyGroupId: z.string().optional(),
  /** Variables updated at each iteration. */
  currentItemVariableId: z.string().optional(),
  currentIndexVariableId: z.string().optional(),
  iterationNumberVariableId: z.string().optional(),
  /** Stops the loop (before running the next iteration) when true. */
  breakCondition: z
    .object({
      isEnabled: z.boolean().optional(),
      condition: conditionSchema.optional(),
    })
    .optional(),
  /** Skips the iteration (checked once the current item variables are set). */
  continueCondition: z
    .object({
      isEnabled: z.boolean().optional(),
      condition: conditionSchema.optional(),
    })
    .optional(),
  /** Human readable loop name used in exports (LOOP column, codebook). */
  name: z.string().optional(),
});

export const loopBlockSchema = blockBaseSchema.merge(
  z.object({
    type: z.enum([LogicBlockType.LOOP]),
    options: loopOptionsSchema.optional(),
  }),
);

export type LoopBlock = z.infer<typeof loopBlockSchema>;
export type LoopOptions = z.infer<typeof loopOptionsSchema>;
