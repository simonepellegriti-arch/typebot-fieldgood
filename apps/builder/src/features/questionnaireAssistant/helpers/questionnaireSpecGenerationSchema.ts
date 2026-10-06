import { zodToSchema } from "@typebot.io/ai/zodToSchema";
import { jsonSchema } from "ai";
import { z } from "zod";
import {
  type QuestionnaireSpec,
  questionnaireSpecSchema,
  questionTypes,
} from "../questionnaireSpecSchema";

/**
 * Schema handed to generateObject: the model gets the strict JSON schema, but
 * its answer is validated leniently (missing nullable fields, numbers written
 * as strings, "constant_sum" instead of "constantSum"...) and normalized to a
 * QuestionnaireSpec, so a small formatting slip doesn't throw the whole
 * questionnaire away.
 */
export const questionnaireSpecGenerationSchema = jsonSchema<QuestionnaireSpec>(
  zodToSchema(questionnaireSpecSchema).jsonSchema,
  {
    validate: (value) => {
      const result = parseGeneratedQuestionnaireSpec(value);
      if (result.success) return { success: true, value: result.data };
      return { success: false, error: result.error };
    },
  },
);

export const parseGeneratedQuestionnaireSpec = (
  value: unknown,
): z.ZodSafeParseResult<QuestionnaireSpec> =>
  lenientSpecSchema.safeParse(value);

const normalizeKey = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]/g, "");

const questionTypeAliases: Record<string, (typeof questionTypes)[number]> = {
  singlechoice: "single",
  radio: "single",
  multiplechoice: "multiple",
  multi: "multiple",
  checkbox: "multiple",
  text: "open",
  shorttext: "open",
  longtext: "openLong",
  textarea: "openLong",
  numeric: "number",
  nps: "rating",
  scale: "rating",
  grid: "matrix",
  sum: "constantSum",
  message: "info",
  foto: "photo",
  picture: "photo",
  camera: "photo",
  firma: "signature",
};

const textOrNull = z
  .unknown()
  .transform((value) =>
    typeof value === "number"
      ? String(value)
      : typeof value === "string" && value.trim() !== ""
        ? value
        : null,
  );

const requiredText = z
  .union([z.string(), z.number()])
  .transform((value) => String(value).trim());

const numberOrNull = z.unknown().transform((value) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsedNumber = Number(value.replace(",", "."));
    if (Number.isFinite(parsedNumber)) return parsedNumber;
  }
  return null;
});

const booleanOrFalse = z
  .unknown()
  .transform((value) => value === true || value === "true");

const listOf = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.preprocess(
    (value) => (value === null || value === undefined ? [] : value),
    z.array(itemSchema),
  );

const questionTypeSchema = z.string().transform((value, context) => {
  const key = normalizeKey(value);
  const questionType =
    questionTypes.find((candidate) => normalizeKey(candidate) === key) ??
    questionTypeAliases[key];
  if (questionType) return questionType;
  context.addIssue({
    code: "custom",
    message: `Unknown question type ${value}`,
  });
  return z.NEVER;
});

const operatorSchema = z.string().transform((value, context) => {
  const key = normalizeKey(value);
  if (["anyof", "in", "equals", "eq", "is"].includes(key)) return "anyOf";
  if (["noneof", "notin", "notequals", "neq", "isnot"].includes(key))
    return "noneOf";
  if (["lessthan", "lt", "less"].includes(key)) return "lessThan";
  if (["greaterthan", "gt", "greater", "morethan"].includes(key))
    return "greaterThan";
  context.addIssue({ code: "custom", message: `Unknown operator ${value}` });
  return z.NEVER;
});

const conditionGroupOrNull = z.preprocess(
  (value) => (value === undefined ? null : value),
  z
    .object({
      logic: z
        .unknown()
        .transform((value) =>
          typeof value === "string" && normalizeKey(value) === "any"
            ? "any"
            : "all",
        ),
      conditions: listOf(
        z.object({
          questionCode: requiredText,
          operator: operatorSchema,
          values: z.preprocess(
            (value) =>
              value === null || value === undefined
                ? []
                : Array.isArray(value)
                  ? value
                  : [value],
            z.array(requiredText),
          ),
        }),
      ),
    })
    .nullable()
    .transform((group) =>
      group && group.conditions.length > 0 ? group : null,
    ),
);

const lenientQuestionSchema = z.object({
  code: requiredText,
  type: questionTypeSchema,
  text: requiredText,
  instructions: textOrNull,
  options: listOf(
    z.object({
      code: requiredText,
      label: requiredText,
      isExclusive: booleanOrFalse,
      isOther: booleanOrFalse,
    }),
  ),
  rows: listOf(z.object({ code: requiredText, label: requiredText })),
  scale: z.preprocess(
    (value) => (value === undefined ? null : value),
    z
      .object({
        min: numberOrNull,
        max: numberOrNull,
        minLabel: textOrNull,
        maxLabel: textOrNull,
      })
      .nullable()
      .transform((scale) =>
        scale && scale.min !== null && scale.max !== null
          ? {
              min: scale.min,
              max: scale.max,
              minLabel: scale.minLabel,
              maxLabel: scale.maxLabel,
            }
          : null,
      ),
  ),
  total: numberOrNull,
  maxSelections: numberOrNull,
  isRandomized: booleanOrFalse,
  showIf: conditionGroupOrNull,
  terminateIf: conditionGroupOrNull,
});

const lenientSpecSchema = z.object({
  title: z
    .unknown()
    .transform((value) =>
      typeof value === "string" && value.trim() ? value.trim() : "Questionario",
    ),
  language: z
    .unknown()
    .transform((value) =>
      typeof value === "string" && value.trim() ? value.trim() : "it",
    ),
  introText: textOrNull,
  closingText: textOrNull,
  screenOutText: textOrNull,
  questions: listOf(lenientQuestionSchema),
  notes: listOf(requiredText),
});
