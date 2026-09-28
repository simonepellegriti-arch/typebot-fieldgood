import type { Prisma } from "@typebot.io/prisma/types";
import { z } from "zod";

const answerV1Schema = z.object({
  createdAt: z.date(),
  resultId: z.string(),
  blockId: z.string(),
  groupId: z.string(),
  variableId: z.string().nullable(),
  content: z.string(),
}) satisfies z.ZodType<Prisma.Answer>;

/**
 * Typed research value stored in AnswerV2.value.
 * Multiple choice answers are arrays, never a joined string.
 */
export const answerResearchValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.string()),
  z.array(z.number()),
]);
export type AnswerResearchValue = z.infer<typeof answerResearchValueSchema>;

export const answerValueLabelSchema = z.union([
  z.string(),
  z.array(z.string()),
]);
export type AnswerValueLabel = z.infer<typeof answerValueLabelSchema>;

export const answerSchema = z.object({
  blockId: z.string(),
  content: z.string(),
  attachedFileUrls: z.array(z.string()).optional(),
  executionIndex: z.number().int().nullish(),
  value: answerResearchValueSchema.nullish().catch(null),
  valueLabel: answerValueLabelSchema.nullish().catch(null),
});

export const answerInputSchema = answerV1Schema
  .omit({
    createdAt: true,
    resultId: true,
    variableId: true,
  })
  .extend({
    variableId: z.string().nullish(),
  }) satisfies z.ZodType<Prisma.Prisma.AnswerUncheckedUpdateInput>;

export const statsSchema = z.object({
  totalViews: z.number(),
  totalStarts: z.number(),
  totalCompleted: z.number(),
});

export type Stats = z.infer<typeof statsSchema>;

export type Answer = z.infer<typeof answerSchema>;

/** Answer as read from the database for research exports (with its timestamp). */
export const researchAnswerSchema = answerSchema.extend({
  createdAt: z.date().optional(),
});
export type ResearchAnswer = z.infer<typeof researchAnswerSchema>;

export type AnswerInput = z.infer<typeof answerInputSchema>;

export const answerInSessionStateSchemaV2 = z.object({
  key: z.string(),
  value: z.string(),
});

export type AnswerInSessionState = z.infer<typeof answerInSessionStateSchemaV2>;
