import { z } from "zod";

/**
 * Questionnaire structure written by the AI from a document (Word, Excel,
 * PowerPoint, PDF, text). FIELDBOT turns it into a bot with
 * convertQuestionnaireSpecToTypebot: the AI never writes the bot itself.
 * Every field is required (nullable when unused) for strict structured outputs.
 */
export const questionTypes = [
  "single",
  "multiple",
  "open",
  "openLong",
  "number",
  "rating",
  "matrix",
  "slider",
  "constantSum",
  "signature",
  "photo",
  "email",
  "phone",
  "date",
  "info",
] as const;

const optionSchema = z.object({
  code: z
    .string()
    .describe("Code as written in the questionnaire (1, 2, 99...)."),
  label: z.string(),
  isExclusive: z
    .boolean()
    .describe("Multiple choice: 'None of these' / 'Don't know' style options."),
  isOther: z
    .boolean()
    .describe("'Other (please specify)': shows a text field."),
});

const rowSchema = z.object({
  code: z.string(),
  label: z.string(),
});

const conditionSchema = z.object({
  questionCode: z.string().describe("Code of an EARLIER question."),
  operator: z.enum(["anyOf", "noneOf", "lessThan", "greaterThan"]),
  values: z
    .array(z.string())
    .describe(
      "Option codes (anyOf / noneOf) or one number (lessThan / greaterThan).",
    ),
});

const conditionGroupSchema = z.object({
  logic: z.enum(["all", "any"]),
  conditions: z.array(conditionSchema),
});

export const questionnaireQuestionSchema = z.object({
  code: z
    .string()
    .describe(
      "Question code from the document (D1, Q2a, S1...). Letters, numbers and _ only.",
    ),
  type: z.enum(questionTypes),
  text: z.string().describe("Question text shown to respondents."),
  instructions: z
    .string()
    .nullable()
    .describe("Short note for respondents, e.g. 'Una sola risposta', or null."),
  options: z
    .array(optionSchema)
    .describe(
      "single / multiple: answer options. matrix: scale columns. Otherwise [].",
    ),
  rows: z
    .array(rowSchema)
    .describe(
      "matrix: statements. slider: statements (or [] for one slider). constantSum: categories. Otherwise [].",
    ),
  scale: z
    .object({
      min: z.number(),
      max: z.number(),
      minLabel: z.string().nullable(),
      maxLabel: z.string().nullable(),
    })
    .nullable()
    .describe("rating / slider / number bounds, or null."),
  total: z
    .number()
    .nullable()
    .describe("constantSum: amount to distribute (100), otherwise null."),
  maxSelections: z.number().nullable(),
  isRandomized: z
    .boolean()
    .describe("Options / statements shown in random order (rotation)."),
  showIf: conditionGroupSchema
    .nullable()
    .describe(
      "Filter: ask the question only when true (from 'SE ... PASSARE A' routing).",
    ),
  terminateIf: conditionGroupSchema
    .nullable()
    .describe("Screen-out: the interview ends when true after this answer."),
});

export const questionnaireSpecSchema = z.object({
  title: z.string(),
  language: z
    .string()
    .describe("ISO code of the questionnaire language, e.g. it, en."),
  introText: z.string().nullable(),
  closingText: z.string().nullable(),
  screenOutText: z
    .string()
    .nullable()
    .describe(
      "Message when the interview ends early, or null for the default.",
    ),
  questions: z.array(questionnaireQuestionSchema),
  notes: z
    .array(z.string())
    .describe(
      "Anything in the document that could not be mapped (quotas, complex routing, loops...).",
    ),
});

export type QuestionnaireSpec = z.infer<typeof questionnaireSpecSchema>;
export type QuestionnaireQuestion = z.infer<typeof questionnaireQuestionSchema>;
export type QuestionnaireCondition = z.infer<typeof conditionSchema>;
export type QuestionnaireConditionGroup = z.infer<typeof conditionGroupSchema>;
