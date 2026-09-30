import { z } from "zod";

export const scoreOperations = ["add", "subtract", "set", "multiply"] as const;

/**
 * Where the score of an answer goes. A question can feed several independent
 * scores (e.g. BRAND_SCORE and TOTAL_SCORE). Variables hold plain numbers, so
 * they can be used in conditions (TOTAL_SCORE >= 20) and in Set variable expressions.
 */
export const scoreTargetSchema = z.object({
  id: z.string(),
  variableId: z.string().optional(),
  operation: z.enum(scoreOperations).optional(),
});

/** Score of an option/column. Separate from its code; negative and zero allowed. */
export const optionScoreSchema = z
  .number()
  .finite()
  .optional()
  .describe(
    "Score of the option, separate from its code (value). Absent = null, not 0.",
  );

export type ScoreTarget = z.infer<typeof scoreTargetSchema>;
export type ScoreOperation = (typeof scoreOperations)[number];
