import { safeParseFloat } from "@typebot.io/lib/safeParseFloat";
import type { Prisma } from "@typebot.io/prisma/types";
import { z } from "zod";
import { isSingleVariable } from "./isSingleVariable";

export const listVariableValue = z.array(z.string().nullable());

export const variableDataTypes = [
  "string",
  "number",
  "boolean",
  "string[]",
  "number[]",
  "datetime",
] as const;
export const variableDataTypeSchema = z.enum(variableDataTypes);
export type VariableDataType = z.infer<typeof variableDataTypeSchema>;

/**
 * Research metadata declared on a variable. Runtime values keep their legacy
 * representation (string or list of strings); the declared type drives how
 * answers are stored (AnswerV2.value) and exported.
 */
const variableResearchMetadataSchema = z.object({
  dataType: variableDataTypeSchema.optional(),
  label: z.string().optional(),
  missingValues: z.array(z.string().or(z.number())).optional(),
});

const baseVariableSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    isSessionVariable: z.boolean().optional(),
  })
  .merge(variableResearchMetadataSchema);

export const variableSchema = baseVariableSchema.extend({
  value: z.string().or(listVariableValue).nullish(),
});
export type Variable = z.infer<typeof variableSchema>;

/**
 * Variable when retrieved from the database
 */
export const variableWithValueSchema = baseVariableSchema.extend({
  value: z.string().or(listVariableValue),
});
export type VariableWithValue = z.infer<typeof variableWithValueSchema>;

/**
 * Variable when computed or retrieved from a block
 */
const variableWithUnknowValueSchema = baseVariableSchema.extend({
  value: z.unknown(),
});
export type VariableWithUnknowValue = z.infer<
  typeof variableWithUnknowValueSchema
>;

export const variableStringSchema = z.custom<`{{${string}}}`>((val) =>
  /^{{.+}}$/g.test(val as string),
);
export type VariableString = z.infer<typeof variableStringSchema>;

export const singleVariableOrNumberSchema = z
  .string()
  .or(z.number())
  .transform((value) => {
    if (typeof value === "string") {
      if (isSingleVariable(value)) return value;
      return safeParseFloat(value);
    }
    return value;
  });

export const setVariableHistoryItemSchema = z.object({
  resultId: z.string(),
  index: z.number(),
  blockId: z.string(),
  blockIndex: z.number().nullable(),
  variableId: z.string(),
  value: z.string().or(listVariableValue).nullable(),
}) satisfies z.ZodType<Prisma.SetVariableHistoryItem>;

export type SetVariableHistoryItem = z.infer<
  typeof setVariableHistoryItemSchema
>;
