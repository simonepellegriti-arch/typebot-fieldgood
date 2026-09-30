import { videoWatchResultSchema } from "@typebot.io/blocks-bubbles/video/schema";
import { getMatrixLongQuestionName } from "./getMatrixLongQuestionName";
import { isObjectResearchValue } from "./isObjectResearchValue";
import type {
  DatasetCell,
  DatasetColumn,
  DatasetDictionary,
  DictionaryQuestion,
  InterviewStatus,
  NormalizedAnswer,
  ResearchDataset,
  ResearchExportOptions,
} from "./schemas";

const longColumns: DatasetColumn[] = [
  { name: "RESULT_ID", kind: "system", label: "Result id", type: "string" },
  { name: "STATUS", kind: "system", label: "Interview status", type: "string" },
  { name: "LOOP", kind: "system", label: "Loop", type: "string" },
  {
    name: "ITERATION",
    kind: "system",
    label: "Loop iteration (1 = first)",
    type: "numeric",
  },
  { name: "ITEM", kind: "system", label: "Loop item code", type: "string" },
  {
    name: "ITEM_LABEL",
    kind: "system",
    label: "Loop item label",
    type: "string",
  },
  {
    name: "EXECUTION",
    kind: "system",
    label: "Execution of the question in the interview",
    type: "numeric",
  },
  {
    name: "QUESTION",
    kind: "system",
    label: "Question (column name)",
    type: "string",
  },
  {
    name: "VALUE",
    kind: "system",
    label: "Response value (code)",
    type: "string",
  },
  { name: "LABEL", kind: "system", label: "Response label", type: "string" },
  { name: "SCORE", kind: "system", label: "Score", type: "numeric" },
  {
    name: "TEXT",
    kind: "system",
    label: "Other, please specify",
    type: "string",
  },
];

/**
 * Long layout: one row per answer (per matrix row for matrices), with its loop
 * context. RESULT_ID | LOOP | ITERATION | ITEM | QUESTION | VALUE | LABEL | SCORE.
 * Questions are identified by their column name (variable name), never by labels.
 */
export const buildLongResearchDataset = ({
  interviews,
  dictionary,
  options,
}: {
  interviews: {
    resultId: string;
    status: InterviewStatus;
    answers: NormalizedAnswer[];
  }[];
  dictionary: DatasetDictionary;
  options: ResearchExportOptions;
}): ResearchDataset => {
  const questionsByBlockId = new Map(
    dictionary.questions.map((question) => [question.blockId, question]),
  );
  const loopsById = new Map(
    (dictionary.loops ?? []).map((loop) => [loop.blockId, loop]),
  );
  const rows = interviews.flatMap(({ resultId, status, answers }) =>
    answers.flatMap((answer) => {
      const question = questionsByBlockId.get(answer.blockId);
      if (!question) return [];
      const loop = answer.loopBlockId
        ? loopsById.get(answer.loopBlockId)
        : undefined;
      const context: DatasetCell[] = [
        resultId,
        status,
        answer.loopBlockId ? (loop?.name ?? answer.loopBlockId) : null,
        answer.loopIteration !== null ? answer.loopIteration + 1 : null,
        answer.loopItem,
        answer.loopItem !== null
          ? (loop?.itemLabels[answer.loopItem] ?? answer.loopItem)
          : null,
        answer.executionIndex,
      ];
      return buildAnswerRows(question, answer, options).map((answerCells) => [
        ...context,
        ...answerCells,
      ]);
    }),
  );
  return { columns: longColumns, rows };
};

const buildAnswerRows = (
  question: DictionaryQuestion,
  answer: NormalizedAnswer,
  options: ResearchExportOptions,
): DatasetCell[][] => {
  const separator = options.multipleChoiceSeparator;
  if (question.kind === "video") {
    const parsedResult = videoWatchResultSchema.safeParse(answer.value);
    if (!parsedResult.success) return [];
    return [
      [
        `${question.variableName}_WATCHED_PCT`,
        parsedResult.data.watchedPercentage,
        null,
        null,
        null,
      ],
    ];
  }
  if (question.kind === "matrix") {
    if (!isObjectResearchValue(answer.value)) return [];
    const valueLabels =
      answer.valueLabel &&
      typeof answer.valueLabel === "object" &&
      !Array.isArray(answer.valueLabel)
        ? answer.valueLabel
        : {};
    return Object.entries(answer.value).map(([rowCode, rowValue]) => {
      const rowLabel = valueLabels[rowCode];
      return [
        getMatrixLongQuestionName(question, rowCode),
        toText(rowValue, separator),
        rowLabel === undefined ? null : toText(rowLabel, separator),
        answer.rowScores?.[rowCode] ?? null,
        null,
      ];
    });
  }
  return [
    [
      question.variableName,
      toText(answer.value, separator),
      answer.valueLabel === null ? null : toText(answer.valueLabel, separator),
      answer.score,
      answer.otherTexts
        ? Object.values(answer.otherTexts).join(separator) || null
        : null,
    ],
  ];
};

const toText = (value: unknown, separator: string): DatasetCell => {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value))
    return value.map((item) => String(item)).join(separator);
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
};
