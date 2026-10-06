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
  "continue",
] as const;

export const openAnswerMedia = ["voice", "video"] as const;

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
  goTo: z
    .string()
    .nullable()
    .describe(
      "single only, routing written next to the option: a question code ('— Passare a Q5' → Q5), END ('— Terminare', closes the interview) or RETURN:<code> ('— Ripetere Q2', the respondent comes back later from Q2). null = next question.",
    ),
});

const rowSchema = z.object({
  code: z.string(),
  label: z.string(),
});

const conditionSchema = z.object({
  questionCode: z
    .string()
    .describe(
      "Code of an EARLIER question, or the name of a link / computed variable.",
    ),
  operator: z.enum(["anyOf", "noneOf", "lessThan", "greaterThan"]),
  values: z
    .array(z.string())
    .describe(
      "Option codes or variable values (anyOf / noneOf), or one number (lessThan / greaterThan).",
    ),
});

const conditionGroupSchema = z.object({
  logic: z.enum(["all", "any"]),
  conditions: z.array(conditionSchema),
});

const probeSchema = z.object({
  elements: z
    .array(z.string())
    .describe(
      "What a complete answer must cover; the AI asks about what is missing or vague.",
    ),
  maxFollowUps: z.number().describe("Follow-up questions at most (1 to 3)."),
});

const stimulusSchema = z.object({
  type: z.enum(["video", "image"]),
  url: z
    .string()
    .nullable()
    .describe(
      "Link to the file when the document gives it; null when it doesn't (the researcher adds it in the editor).",
    ),
  label: z
    .string()
    .describe(
      "Name for the researcher, e.g. 'Video Gaviscon'. Never shown to respondents.",
    ),
  allowReplay: z
    .boolean()
    .describe(
      "Video: the respondent may watch it once more (recorded). From 'replay una sola volta'.",
    ),
});

export const questionnaireQuestionSchema = z.object({
  code: z
    .string()
    .describe(
      "Question code from the document (D1, Q2a, S1...). Letters, numbers and _ only.",
    ),
  type: z.enum(questionTypes),
  text: z
    .string()
    .describe(
      "Question text shown to respondents. Piping: {{CODE}} shows the answer to an earlier question, {{name}} a link / computed variable.",
    ),
  instructions: z
    .string()
    .nullable()
    .describe("Short note for respondents, e.g. 'Una sola risposta', or null."),
  options: z
    .array(optionSchema)
    .describe(
      "single / multiple: answer options. matrix: scale columns. continue: one option = button text. Otherwise [].",
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
  maxSelections: z
    .number()
    .nullable()
    .describe("multiple: most options selectable. photo: number of photos."),
  isRandomized: z
    .boolean()
    .describe("Options / statements shown in random order (rotation)."),
  media: z
    .enum(openAnswerMedia)
    .nullable()
    .describe(
      "open / openLong only: answer by voice message (transcribed) or by video. null = written.",
    ),
  probe: probeSchema
    .nullable()
    .describe("open / openLong only: AI follow-up questions, or null."),
  stimulus: stimulusSchema
    .nullable()
    .describe(
      "Video or image shown before the question text (concept, pack, spot), or null.",
    ),
  showIf: conditionGroupSchema
    .nullable()
    .describe(
      "Filter: ask the question only when true (from 'SE ... PASSARE A' routing).",
    ),
  terminateIf: conditionGroupSchema
    .nullable()
    .describe("Screen-out: the interview ends when true after this answer."),
});

const linkVariableSchema = z.object({
  name: z
    .string()
    .describe("Variable name: letters, numbers and _ (e.g. uid, panel)."),
  description: z.string(),
});

const computedVariableSchema = z.object({
  name: z.string().describe("Variable used in texts as {{name}}."),
  sourceVariable: z
    .string()
    .describe("Link / Airtable variable or question code it depends on."),
  cases: z
    .array(z.object({ whenValue: z.string(), text: z.string() }))
    .describe("Text to use for each value of the source variable."),
  defaultText: z.string().describe("Text when no case matches."),
});

const airtableSchema = z.object({
  baseId: z.string().describe("Airtable base id (app…)."),
  tableId: z.string().describe("Airtable table id (tbl…) or name."),
  lookupField: z
    .string()
    .describe("Airtable field that identifies the respondent (Telefono, ID…)."),
  linkParameter: z
    .string()
    .describe("Link parameter holding that value (uid, cid…)."),
  loadFields: z
    .array(z.object({ airtableField: z.string(), variable: z.string() }))
    .describe("Respondent fields loaded at the start (Nome, PDV, Panel…)."),
});

const loopSchema = z.object({
  name: z
    .string()
    .describe(
      "Short name in capitals, e.g. VIDEO. In the repeated texts {{VIDEO}} shows the item label.",
    ),
  firstQuestion: z.string().describe("Code of the first repeated question."),
  lastQuestion: z.string().describe("Code of the last repeated question."),
  isRandomized: z
    .boolean()
    .describe("Items in random order for each respondent (rotation)."),
  items: z
    .array(
      z.object({
        code: z
          .string()
          .describe(
            "Short suffix added to the repeated codes (G1 → G1_GAV): letters and numbers.",
          ),
        label: z.string(),
        stimulus: stimulusSchema
          .nullable()
          .describe("Shown before the first repeated question, or null."),
      }),
    )
    .describe("What the questions are repeated for, in document order."),
});

export const questionnaireSpecSchema = z.object({
  title: z.string(),
  language: z
    .string()
    .describe("ISO code of the questionnaire language, e.g. it, en."),
  addressForm: z
    .enum(["tu", "lei"])
    .describe("How respondents are addressed (Italian: tu / lei)."),
  privacyUrl: z
    .string()
    .nullable()
    .describe("PDF of the privacy notice to accept before starting, or null."),
  voiceTest: z
    .boolean()
    .describe(
      "Microphone test before the questions (when there are voice answers).",
    ),
  introText: z.string().nullable(),
  closingText: z.string().nullable(),
  screenOutText: z
    .string()
    .nullable()
    .describe(
      "Message when the interview ends early, or null for the default.",
    ),
  linkVariables: z
    .array(linkVariableSchema)
    .describe(
      "Values that come with the respondent's link or Airtable record (panel, target, store…).",
    ),
  computedVariables: z
    .array(computedVariableSchema)
    .describe(
      "Texts that change with a variable, e.g. format = 'lattina 330ml' when panel = TEST.",
    ),
  airtable: airtableSchema
    .nullable()
    .describe(
      "ONLY when the researcher asks to connect Airtable and gives base and table; otherwise null.",
    ),
  questions: z.array(questionnaireQuestionSchema),
  loops: z
    .array(loopSchema)
    .describe(
      "Questions repeated for each stimulus / brand / product ('Ripetere G1–G8 dopo ciascun video'). Write the repeated questions ONCE; the bot repeats them. [] when none.",
    ),
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
export type QuestionnaireAirtable = z.infer<typeof airtableSchema>;
export type QuestionnaireStimulus = z.infer<typeof stimulusSchema>;
export type QuestionnaireLoop = z.infer<typeof loopSchema>;
