import {
  blockBaseSchema,
  optionBaseSchema,
} from "@typebot.io/blocks-base/schemas";
import { z } from "zod";
import { InputBlockType } from "../constants";

/** A category receiving part of the total. `value` is its stable export code. */
export const constantSumItemSchema = z.object({
  id: z.string(),
  label: z.string().optional(),
  value: z.string().optional(),
  /** Optional variable receiving the points given to this category. */
  variableId: z.string().optional(),
});

export const constantSumInputOptionsSchema = optionBaseSchema.extend({
  question: z.string().optional(),
  items: z.array(constantSumItemSchema).optional(),
  /** Amount to distribute exactly (100 by default). */
  total: z.number().int().positive().optional(),
  /** Shown next to the amounts, e.g. "%" or "€". Exports keep plain numbers. */
  unit: z.string().optional(),
  areItemsRandomized: z.boolean().optional(),
  totalLabel: z.string().optional(),
  buttonLabel: z.string().optional(),
});

export const constantSumInputSchema = blockBaseSchema.merge(
  z.object({
    type: z.enum([InputBlockType.CONSTANT_SUM]),
    options: constantSumInputOptionsSchema.optional(),
  }),
);

/** Structured reply of the web client: amount by category id. */
export const constantSumStructuredReplySchema = z.object({
  type: z.literal("constantSum"),
  values: z.record(z.string(), z.number()),
});

export type ConstantSumItem = z.infer<typeof constantSumItemSchema>;
export type ConstantSumInputOptions = z.infer<
  typeof constantSumInputOptionsSchema
>;
export type ConstantSumInputBlock = z.infer<typeof constantSumInputSchema>;
export type ConstantSumStructuredReply = z.infer<
  typeof constantSumStructuredReplySchema
>;
