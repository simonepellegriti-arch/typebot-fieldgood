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
  button: "continue",
  pulsante: "continue",
  next: "continue",
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

const mediaOrNull = z.unknown().transform((value) => {
  if (typeof value !== "string") return null;
  const key = normalizeKey(value);
  if (["voice", "vocale", "audio", "voicemessage"].includes(key))
    return "voice" as const;
  if (["video", "videomessage"].includes(key)) return "video" as const;
  return null;
});

const probeOrNull = z.preprocess(
  (value) => (value === undefined ? null : value),
  z
    .object({
      elements: listOf(requiredText),
      maxFollowUps: numberOrNull,
    })
    .nullable()
    .transform((probe) =>
      probe
        ? {
            elements: probe.elements,
            maxFollowUps: Math.min(
              3,
              Math.max(1, Math.round(probe.maxFollowUps ?? 1)),
            ),
          }
        : null,
    ),
);

const variableName = requiredText.transform((value) =>
  value.replace(/[^\p{L}\p{N}_]+/gu, "_").replace(/^_+|_+$/g, ""),
);

const airtableOrNull = z.preprocess(
  (value) => (value === undefined ? null : value),
  z
    .object({
      baseId: requiredText,
      tableId: requiredText,
      lookupField: textOrNull,
      linkParameter: textOrNull,
      loadFields: listOf(
        z.object({ airtableField: requiredText, variable: variableName }),
      ),
    })
    .nullable()
    .transform((airtable) =>
      airtable && airtable.baseId && airtable.tableId
        ? {
            ...airtable,
            lookupField: airtable.lookupField ?? "Telefono",
            linkParameter: (airtable.linkParameter ?? "uid").replace(
              /[^\p{L}\p{N}_]+/gu,
              "_",
            ),
          }
        : null,
    ),
);

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

const stimulusOrNull = z.preprocess(
  (value) => (value === undefined ? null : value),
  z
    .object({
      type: z.unknown(),
      url: textOrNull,
      label: textOrNull,
      allowReplay: booleanOrFalse,
    })
    .nullable()
    .transform((stimulus) => {
      if (!stimulus) return null;
      const key =
        typeof stimulus.type === "string" ? normalizeKey(stimulus.type) : "";
      const type = ["image", "immagine", "foto", "picture", "photo"].includes(
        key,
      )
        ? ("image" as const)
        : ("video" as const);
      const url = stimulus.url?.trim() ?? null;
      return {
        type,
        url: url && /^https?:\/\//i.test(url) ? url : null,
        label: stimulus.label ?? (type === "video" ? "Video" : "Immagine"),
        allowReplay: type === "video" && stimulus.allowReplay,
      };
    }),
);

const lenientQuestionSchema = z
  .object({
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
        goTo: textOrNull.transform((value) => value?.trim() || null),
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
    media: mediaOrNull,
    probe: probeOrNull,
    stimulus: stimulusOrNull,
    showIf: conditionGroupOrNull,
    terminateIf: conditionGroupOrNull,
  })
  .transform((question) =>
    // FieldGood standard: open answers can always be typed or recorded.
    (question.type === "open" || question.type === "openLong") &&
    !question.media
      ? { ...question, media: "voice" as const }
      : question,
  );

const lenientSpecSchema = z
  .object({
    title: z
      .unknown()
      .transform((value) =>
        typeof value === "string" && value.trim()
          ? value.trim()
          : "Questionario",
      ),
    language: z
      .unknown()
      .transform((value) =>
        typeof value === "string" && value.trim() ? value.trim() : "it",
      ),
    addressForm: z
      .unknown()
      .transform((value) =>
        typeof value === "string" && normalizeKey(value) === "lei"
          ? ("lei" as const)
          : ("tu" as const),
      ),
    privacyUrl: textOrNull,
    voiceTest: booleanOrFalse,
    introText: textOrNull,
    closingText: textOrNull,
    screenOutText: textOrNull,
    linkVariables: listOf(
      z.object({ name: variableName, description: textOrNull }),
    ).transform((variables) =>
      variables
        .filter((variable) => variable.name)
        .map((variable) => ({
          name: variable.name,
          description: variable.description ?? "",
        })),
    ),
    computedVariables: listOf(
      z.object({
        name: variableName,
        sourceVariable: requiredText,
        cases: listOf(
          z.object({ whenValue: requiredText, text: requiredText }),
        ),
        defaultText: textOrNull,
      }),
    ).transform((variables) =>
      variables
        .filter((variable) => variable.name && variable.sourceVariable)
        .map((variable) => ({
          ...variable,
          defaultText: variable.defaultText ?? "",
        })),
    ),
    airtable: airtableOrNull,
    questions: listOf(lenientQuestionSchema),
    loops: listOf(
      z.object({
        name: variableName,
        firstQuestion: requiredText,
        lastQuestion: requiredText,
        isRandomized: booleanOrFalse,
        items: listOf(
          z.object({
            code: variableName,
            label: requiredText,
            stimulus: stimulusOrNull,
          }),
        ),
      }),
    ).transform((loops) =>
      loops.filter(
        (loop) =>
          loop.name &&
          loop.items.filter((item) => item.code).length > 0 &&
          loop.firstQuestion &&
          loop.lastQuestion,
      ),
    ),
    notes: listOf(requiredText),
  })
  .transform((spec) => ({
    ...spec,
    // Airtable, personal links and resume live on the Participants page.
    airtable: null,
    // Microphone test whenever respondents can answer by voice.
    voiceTest: spec.questions.some((question) => question.media === "voice"),
  }));
