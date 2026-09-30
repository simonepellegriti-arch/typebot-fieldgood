import {
  blockBaseSchema,
  optionBaseSchema,
} from "@typebot.io/blocks-base/schemas";
import { z } from "zod";
import { InputBlockType } from "../constants";
import { optionScoreSchema, scoreTargetSchema } from "../scoring/schema";

/**
 * A matrix row (statement to rate). `value` is the stable code used in exports
 * (D10_<value>); `label` is only what respondents see.
 */
export const matrixRowSchema = z.object({
  id: z.string(),
  label: z.string().optional(),
  value: z.string().optional(),
  /** Only used when requiredMode is "custom". */
  isRequired: z.boolean().optional(),
  /** Optional variable receiving this row's code (usable in conditions). */
  variableId: z.string().optional(),
});

/** A matrix column (scale point). `value` is the code stored for the row. */
export const matrixColumnSchema = z.object({
  id: z.string(),
  label: z.string().optional(),
  value: z.string().optional(),
  /** Score given to each row answered with this column (separate from the code). */
  score: optionScoreSchema,
});

export const matrixInputOptionsSchema = optionBaseSchema.extend({
  question: z.string().optional(),
  rows: z.array(matrixRowSchema).optional(),
  columns: z.array(matrixColumnSchema).optional(),
  /** single: one column per row. multiple: several columns per row (stored as arrays). */
  answerMode: z.enum(["single", "multiple"]).optional(),
  requiredMode: z.enum(["all", "none", "custom"]).optional(),
  minAnsweredRows: z.number().int().nonnegative().optional(),
  maxAnsweredRows: z.number().int().positive().optional(),
  /** Display order only: codes never change. */
  areRowsRandomized: z.boolean().optional(),
  areColumnsRandomized: z.boolean().optional(),
  /** auto: table on wide screens, one card per row on narrow screens. */
  layout: z.enum(["auto", "table", "cards"]).optional(),
  buttonLabel: z.string().optional(),
  scoreTargets: z.array(scoreTargetSchema).optional(),
});

export const matrixInputSchema = blockBaseSchema.merge(
  z.object({
    type: z.enum([InputBlockType.MATRIX]),
    options: matrixInputOptionsSchema.optional(),
  }),
);

/**
 * Structured reply sent by the web client: selected column ids by row id.
 * Always arrays so that "multiple per row" needs no model change.
 */
export const matrixStructuredReplySchema = z.object({
  type: z.literal("matrix"),
  answers: z.record(z.string(), z.array(z.string()).max(100)),
});

export type MatrixRow = z.infer<typeof matrixRowSchema>;
export type MatrixColumn = z.infer<typeof matrixColumnSchema>;
export type MatrixInputOptions = z.infer<typeof matrixInputOptionsSchema>;
export type MatrixInputBlock = z.infer<typeof matrixInputSchema>;
export type MatrixStructuredReply = z.infer<typeof matrixStructuredReplySchema>;
