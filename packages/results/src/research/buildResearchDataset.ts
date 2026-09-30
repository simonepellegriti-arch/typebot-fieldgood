import { videoWatchResultSchema } from "@typebot.io/blocks-bubbles/video/schema";
import { InputBlockType } from "@typebot.io/blocks-inputs/constants";
import type {
  VariableDataType,
  VariableWithValue,
} from "@typebot.io/variables/schemas";
import { formatInTimeZone } from "date-fns-tz";
import type { ResearchAnswer } from "../schemas/answers";
import { buildLongResearchDataset } from "./buildLongResearchDataset";
import { coerceResearchValue, isNumericLiteral } from "./coerceResearchValue";
import { computeInterviewTiming } from "./computeInterviewTiming";
import { isObjectResearchValue } from "./isObjectResearchValue";
import { normalizeResultAnswers } from "./normalizeResultAnswers";
import type {
  DatasetCell,
  DatasetColumn,
  DatasetDictionary,
  DictionaryQuestion,
  NormalizedAnswer,
  ResearchDataset,
  ResearchExportOptions,
  VideoMetric,
} from "./schemas";
import { systemColumns, videoMetrics } from "./schemas";

export type ResearchResultInput = {
  id: string;
  createdAt: Date;
  hasStarted: boolean | null;
  isCompleted: boolean;
  completedAt?: Date | null;
  publishedVersionId?: string | null;
  publishedVersionNumber?: number | null;
  variables: VariableWithValue[];
  answers: ResearchAnswer[];
};

/**
 * Builds a rectangular research dataset (one row per interview) from structured answers.
 * Column names come from the dictionary (variable names), never from question texts.
 */
export const buildResearchDataset = ({
  dictionary,
  results,
  options,
  now = new Date(),
}: {
  dictionary: DatasetDictionary;
  results: ResearchResultInput[];
  options: ResearchExportOptions;
  now?: Date;
}): ResearchDataset & {
  dictionary: DatasetDictionary;
  /** Long layout (one row per answer), when includeLongFormat is set. */
  longDataset?: ResearchDataset;
} => {
  const questionsByBlockId = new Map(
    dictionary.questions.map((question) => [question.blockId, question]),
  );

  const preparedResults = results
    .filter((result) => isResultInVersionFilter(result, options))
    .map((result) => {
      const answers = normalizeResultAnswers(
        result.answers,
        questionsByBlockId,
      );
      const timing = computeInterviewTiming(result, {
        answerDates: answers.flatMap((answer) =>
          answer.createdAt ? [answer.createdAt] : [],
        ),
        abandonedAfterMinutes: options.abandonedAfterMinutes,
        now,
      });
      return { result, answers, timing };
    })
    .filter(({ timing }) => {
      if (timing.status === "NOT_STARTED" && !options.includeNotStarted)
        return false;
      if (options.statusFilter === "complete")
        return timing.status === "COMPLETE";
      if (options.statusFilter === "incomplete")
        return timing.status !== "COMPLETE";
      return true;
    });

  const extendedDictionary = addQuestionsForUnknownBlocks(
    dictionary,
    preparedResults.flatMap(({ answers }) => answers),
  );

  const slotsByBlockId = buildAnswerSlots(
    preparedResults.flatMap(({ answers }) => answers),
    options,
    extendedDictionary.loops ?? [],
  );

  const columns: DatasetColumn[] = [
    ...buildSystemColumns(),
    ...extendedDictionary.questions.flatMap((question) =>
      buildQuestionColumns(question, {
        options,
        slots: slotsByBlockId.get(question.blockId) ?? [undefined],
      }),
    ),
    ...extendedDictionary.variables.map<DatasetColumn>((variable) => ({
      name: variable.name,
      kind: "variable",
      label: variable.label,
      type: toColumnType(variable.dataType),
    })),
  ];

  const questionsById = new Map(
    extendedDictionary.questions.map((question) => [question.id, question]),
  );

  const rows = preparedResults.map(({ result, answers, timing }) => {
    const answersByBlockId = new Map<string, NormalizedAnswer[]>();
    for (const answer of answers)
      answersByBlockId.set(answer.blockId, [
        ...(answersByBlockId.get(answer.blockId) ?? []),
        answer,
      ]);

    return columns.map<DatasetCell>((column) => {
      switch (column.kind) {
        case "system":
          return computeSystemCell(column.name, { result, timing, options });
        case "variable": {
          const dictionaryVariable = extendedDictionary.variables.find(
            (variable) => variable.name === column.name,
          );
          const resultVariable = result.variables.find(
            (variable) => variable.id === dictionaryVariable?.id,
          );
          if (!dictionaryVariable || !resultVariable) return null;
          return toCell(
            coerceResearchValue(
              resultVariable.value,
              dictionaryVariable.dataType,
            ),
            options,
          );
        }
        case "question": {
          const question = column.questionId
            ? questionsById.get(column.questionId)
            : undefined;
          if (!question) return null;
          return computeQuestionCell(column, {
            question,
            answers: answersByBlockId.get(question.blockId) ?? [],
            options,
          });
        }
      }
    });
  });

  return {
    columns,
    rows,
    dictionary: extendedDictionary,
    longDataset: options.includeLongFormat
      ? buildLongResearchDataset({
          interviews: preparedResults.map(({ result, answers, timing }) => ({
            resultId: result.id,
            status: timing.status,
            answers,
          })),
          dictionary: extendedDictionary,
          options,
        })
      : undefined,
  };
};

const isResultInVersionFilter = (
  result: ResearchResultInput,
  options: ResearchExportOptions,
) => {
  if (!options.versionNumbers) return true;
  if (
    result.publishedVersionNumber === null ||
    result.publishedVersionNumber === undefined
  )
    return options.includePreVersioningResults;
  return options.versionNumbers.includes(result.publishedVersionNumber);
};

const buildSystemColumns = (): DatasetColumn[] => [
  {
    name: systemColumns.resultId,
    kind: "system",
    label: "Result id",
    type: "string",
  },
  {
    name: systemColumns.status,
    kind: "system",
    label: "Interview status",
    type: "string",
  },
  {
    name: systemColumns.isStarted,
    kind: "system",
    label: "Interview started",
    type: "numeric",
  },
  {
    name: systemColumns.isCompleted,
    kind: "system",
    label: "Interview completed",
    type: "numeric",
  },
  {
    name: systemColumns.startTs,
    kind: "system",
    label: "Interview start",
    type: "datetime",
  },
  {
    name: systemColumns.endTs,
    kind: "system",
    label: "Interview end",
    type: "datetime",
  },
  {
    name: systemColumns.lastActivityTs,
    kind: "system",
    label: "Last activity",
    type: "datetime",
  },
  {
    name: systemColumns.durationSeconds,
    kind: "system",
    label: "Interview duration (seconds)",
    type: "numeric",
  },
  {
    name: systemColumns.typebotVersion,
    kind: "system",
    label: "Questionnaire version",
    type: "numeric",
  },
  {
    name: systemColumns.typebotVersionId,
    kind: "system",
    label: "Questionnaire version id",
    type: "string",
  },
];

const computeSystemCell = (
  columnName: string,
  {
    result,
    timing,
    options,
  }: {
    result: ResearchResultInput;
    timing: ReturnType<typeof computeInterviewTiming>;
    options: ResearchExportOptions;
  },
): DatasetCell => {
  switch (columnName) {
    case systemColumns.resultId:
      return result.id;
    case systemColumns.status:
      return timing.status;
    case systemColumns.isStarted:
      return timing.isStarted ? 1 : 0;
    case systemColumns.isCompleted:
      return timing.isCompleted ? 1 : 0;
    case systemColumns.startTs:
      return formatTimestamp(timing.startTs, options.timeZone);
    case systemColumns.endTs:
      return timing.endTs
        ? formatTimestamp(timing.endTs, options.timeZone)
        : null;
    case systemColumns.lastActivityTs:
      return formatTimestamp(timing.lastActivityTs, options.timeZone);
    case systemColumns.durationSeconds:
      return timing.durationSeconds;
    case systemColumns.typebotVersion:
      return result.publishedVersionNumber ?? null;
    case systemColumns.typebotVersionId:
      return result.publishedVersionId ?? null;
    default:
      return null;
  }
};

/**
 * ISO 8601. UTC by default; with a time zone the local time is written with its offset
 * (e.g. 2026-09-28T12:00:00.000+02:00) so the instant stays unambiguous.
 */
export const formatTimestamp = (date: Date, timeZone: string | undefined) =>
  timeZone
    ? formatInTimeZone(date, timeZone, "yyyy-MM-dd'T'HH:mm:ss.SSSXXX")
    : date.toISOString();

type AnswerSlot =
  | {
      suffix: string;
      labelSuffix: string;
      fields: Pick<DatasetColumn, "executionIndex" | "loopSlot">;
    }
  | undefined;

/**
 * Wide layout of repeated answers:
 * - answers given inside a loop get one set of columns per loop item (D2_NIKE)
 *   or per iteration (D2_1), never merged;
 * - other repeated answers get one set of columns per execution (D2_1, D2_2).
 */
const buildAnswerSlots = (
  answers: NormalizedAnswer[],
  options: ResearchExportOptions,
  loops: NonNullable<DatasetDictionary["loops"]>,
): Map<string, AnswerSlot[]> => {
  const answersByBlockId = new Map<string, NormalizedAnswer[]>();
  for (const answer of answers)
    answersByBlockId.set(answer.blockId, [
      ...(answersByBlockId.get(answer.blockId) ?? []),
      answer,
    ]);

  const slotsByBlockId = new Map<string, AnswerSlot[]>();
  for (const [blockId, blockAnswers] of answersByBlockId) {
    if (options.repeatedAnswersMode === "json") continue;
    const loopAnswers = blockAnswers.filter(
      (answer) => answer.loopBlockId !== null && answer.loopIteration !== null,
    );
    if (loopAnswers.length > 0) {
      slotsByBlockId.set(blockId, buildLoopSlots(loopAnswers, options, loops));
      continue;
    }
    const maxExecutions = Math.max(
      ...blockAnswers.map((answer) => answer.executionIndex),
    );
    if (options.repeatedAnswersMode === "columns" && maxExecutions > 1)
      slotsByBlockId.set(
        blockId,
        Array.from({ length: maxExecutions }, (_, index) => ({
          suffix: String(index + 1),
          labelSuffix: `#${index + 1}`,
          fields: { executionIndex: index + 1 },
        })),
      );
  }
  return slotsByBlockId;
};

const buildLoopSlots = (
  loopAnswers: NormalizedAnswer[],
  options: ResearchExportOptions,
  loops: NonNullable<DatasetDictionary["loops"]>,
): AnswerSlot[] => {
  const itemLabelsByLoopId = new Map(
    loops.map((loop) => [loop.blockId, loop.itemLabels]),
  );
  const byItem = options.loopColumnNaming === "item";
  const slotsByKey = new Map<
    string,
    { loopBlockId: string; loopItem?: string; loopIteration: number }
  >();
  for (const answer of loopAnswers) {
    if (answer.loopBlockId === null || answer.loopIteration === null) continue;
    const key = `${answer.loopBlockId}:${
      byItem && answer.loopItem !== null
        ? answer.loopItem
        : answer.loopIteration
    }`;
    const existingSlot = slotsByKey.get(key);
    if (!existingSlot || answer.loopIteration < existingSlot.loopIteration)
      slotsByKey.set(key, {
        loopBlockId: answer.loopBlockId,
        loopItem: byItem ? (answer.loopItem ?? undefined) : undefined,
        loopIteration: answer.loopIteration,
      });
  }
  const usedSuffixes = new Set<string>();
  return [...slotsByKey.values()]
    .sort((a, b) => a.loopIteration - b.loopIteration)
    .map((slot) => {
      const itemLabel =
        slot.loopItem !== undefined
          ? (itemLabelsByLoopId.get(slot.loopBlockId)?.[slot.loopItem] ??
            slot.loopItem)
          : undefined;
      // Item naming uses the item text (D2_NIKE), even when the stored item is a code.
      let suffix =
        itemLabel !== undefined
          ? toLoopItemSuffix(itemLabel, slot.loopIteration)
          : String(slot.loopIteration + 1);
      if (usedSuffixes.has(suffix))
        suffix = `${suffix}_${slot.loopIteration + 1}`;
      usedSuffixes.add(suffix);
      return {
        suffix,
        labelSuffix: itemLabel ?? `#${slot.loopIteration + 1}`,
        fields: {
          loopSlot:
            slot.loopItem !== undefined
              ? { loopBlockId: slot.loopBlockId, loopItem: slot.loopItem }
              : {
                  loopBlockId: slot.loopBlockId,
                  loopIteration: slot.loopIteration,
                },
        },
      };
    });
};

/** "Nike" → NIKE, "Coca-Cola" → COCA_COLA, codes kept as is; too long → iteration number. */
const toLoopItemSuffix = (loopItem: string, loopIteration: number) => {
  const suffix = loopItem
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return suffix && suffix.length <= 16 ? suffix : String(loopIteration + 1);
};

const buildQuestionColumns = (
  question: DictionaryQuestion,
  { options, slots }: { options: ResearchExportOptions; slots: AnswerSlot[] },
): DatasetColumn[] =>
  slots.flatMap((slot) => {
    const columns = buildSlotColumns(question, { options, slot });
    return [...columns, ...buildScoreColumns(question, { options, slot })];
  });

const buildSlotColumns = (
  question: DictionaryQuestion,
  { options, slot }: { options: ResearchExportOptions; slot: AnswerSlot },
): DatasetColumn[] => {
  const slotFields = slot?.fields ?? {};
  const baseName = slot
    ? `${question.variableName}_${slot.suffix}`
    : question.variableName;
  const baseLabel = slot
    ? `${question.label} (${slot.labelSuffix})`
    : question.label;

  if (options.repeatedAnswersMode !== "json") {
    if (question.kind === "video")
      return videoMetrics.map<DatasetColumn>((videoMetric) => ({
        name: `${baseName}_${videoMetric}`,
        kind: "question",
        questionId: question.id,
        ...slotFields,
        videoMetric,
        label: `${baseLabel}: ${videoMetricLabels[videoMetric]}`,
        type: "numeric",
      }));
    if (question.kind === "matrix")
      return buildMatrixColumns(question, {
        baseName,
        baseLabel,
        slotFields,
        options,
      });
  }

  const otherTextColumns =
    options.repeatedAnswersMode !== "json"
      ? buildOtherTextColumns(question, {
          baseName,
          baseLabel,
          slotFields,
        })
      : [];

  if (
    question.isMultiple &&
    options.multipleChoiceMode === "dichotomous" &&
    options.repeatedAnswersMode !== "json"
  )
    return [
      ...question.options.map<DatasetColumn>((option, optionIndex) => ({
        name: `${baseName}_${toOptionSuffix(option.value, optionIndex)}`,
        kind: "question",
        questionId: question.id,
        optionValue: option.value,
        ...slotFields,
        label: `${baseLabel}: ${option.label}`,
        type: "numeric",
      })),
      ...otherTextColumns,
    ];

  const valueColumn: DatasetColumn = {
    name: baseName,
    kind: "question",
    questionId: question.id,
    ...slotFields,
    isLabelColumn: options.valueMode === "label",
    label: baseLabel,
    type:
      options.valueMode === "label" ||
      question.isMultiple ||
      options.repeatedAnswersMode === "json"
        ? "string"
        : toColumnType(question.dataType),
  };
  // Label columns only make sense for questions with coded options.
  if (options.valueMode !== "both" || question.options.length === 0)
    return [valueColumn, ...otherTextColumns];
  return [
    valueColumn,
    {
      ...valueColumn,
      name: `${baseName}_LABEL`,
      isLabelColumn: true,
      label: `${baseLabel} (label)`,
      type: "string",
    },
    ...otherTextColumns,
  ];
};

type SlotFields = Pick<DatasetColumn, "executionIndex" | "loopSlot">;

/**
 * Scores are exported next to the codes, never instead of them:
 * D1 = code, D1_LABEL = label, D1_SCORE = score (matrix: one per row + total).
 */
const buildScoreColumns = (
  question: DictionaryQuestion,
  { options, slot }: { options: ResearchExportOptions; slot: AnswerSlot },
): DatasetColumn[] => {
  if (
    !options.includeScores ||
    !question.hasScores ||
    options.repeatedAnswersMode === "json"
  )
    return [];
  const slotFields = slot?.fields ?? {};
  const baseName = slot
    ? `${question.variableName}_${slot.suffix}`
    : question.variableName;
  const baseLabel = slot
    ? `${question.label} (${slot.labelSuffix})`
    : question.label;
  const rowScoreColumns =
    question.kind === "matrix"
      ? (question.matrixRows ?? []).map<DatasetColumn>((row, rowIndex) => ({
          name: `${baseName}_${toOptionSuffix(row.value, rowIndex)}_SCORE`,
          kind: "question",
          questionId: question.id,
          ...slotFields,
          scoreOf: { matrixRowValue: row.value },
          label: `${baseLabel}: ${row.label} (score)`,
          type: "numeric",
        }))
      : [];
  return [
    ...rowScoreColumns,
    {
      name: `${baseName}_SCORE`,
      kind: "question",
      questionId: question.id,
      ...slotFields,
      scoreOf: {},
      label: `${baseLabel} (score)`,
      type: "numeric",
    },
  ];
};

const videoMetricLabels: Record<VideoMetric, string> = {
  STARTED: "video started",
  COMPLETED: "video watched to the end",
  WATCHED_SECONDS: "seconds watched",
  WATCHED_PCT: "% of the video watched",
  PAUSES: "number of pauses",
};

/**
 * One column per matrix row (D10_1, D10_2...), named after row codes.
 * With several columns per row and dichotomous mode: one 0/1 column per row x column.
 */
const buildMatrixColumns = (
  question: DictionaryQuestion,
  {
    baseName,
    baseLabel,
    slotFields,
    options,
  }: {
    baseName: string;
    baseLabel: string;
    slotFields: SlotFields;
    options: ResearchExportOptions;
  },
): DatasetColumn[] =>
  (question.matrixRows ?? []).flatMap((row, rowIndex) => {
    const rowName = `${baseName}_${toOptionSuffix(row.value, rowIndex)}`;
    const rowLabel = `${baseLabel}: ${row.label}`;
    if (
      question.isMultiplePerRow &&
      options.multipleChoiceMode === "dichotomous"
    )
      return question.options.map<DatasetColumn>((option, optionIndex) => ({
        name: `${rowName}_${toOptionSuffix(option.value, optionIndex)}`,
        kind: "question",
        questionId: question.id,
        ...slotFields,
        matrixRowValue: row.value,
        optionValue: option.value,
        label: `${rowLabel}: ${option.label}`,
        type: "numeric",
      }));
    const rowColumn: DatasetColumn = {
      name: rowName,
      kind: "question",
      questionId: question.id,
      ...slotFields,
      matrixRowValue: row.value,
      isLabelColumn: options.valueMode === "label",
      label: rowLabel,
      type:
        options.valueMode === "label" || question.isMultiplePerRow
          ? "string"
          : toColumnType(question.dataType),
    };
    if (options.valueMode !== "both") return [rowColumn];
    return [
      rowColumn,
      {
        ...rowColumn,
        name: `${rowName}_LABEL`,
        isLabelColumn: true,
        label: `${rowLabel} (label)`,
        type: "string",
      },
    ];
  });

/**
 * "Other, please specify" open texts: D5_OTHER for single choice,
 * D5_<code>_TEXT per "other" option for multiple choice. Never merged into codes.
 */
const buildOtherTextColumns = (
  question: DictionaryQuestion,
  {
    baseName,
    baseLabel,
    slotFields,
  }: {
    baseName: string;
    baseLabel: string;
    slotFields: SlotFields;
  },
): DatasetColumn[] => {
  const otherOptionValues = question.otherOptionValues ?? [];
  if (otherOptionValues.length === 0) return [];
  if (!question.isMultiple)
    return [
      {
        name: `${baseName}_OTHER`,
        kind: "question",
        questionId: question.id,
        ...slotFields,
        otherText: {},
        label: `${baseLabel} (other, specify)`,
        type: "string",
      },
    ];
  return otherOptionValues.map<DatasetColumn>((optionValue) => {
    const optionIndex = question.options.findIndex(
      (option) => String(option.value) === String(optionValue),
    );
    const optionLabel =
      question.options[optionIndex]?.label ?? String(optionValue);
    return {
      name: `${baseName}_${toOptionSuffix(optionValue, Math.max(optionIndex, 0))}_TEXT`,
      kind: "question",
      questionId: question.id,
      ...slotFields,
      otherText: { optionValue },
      label: `${baseLabel}: ${optionLabel} (text)`,
      type: "string",
    };
  });
};

const toOptionSuffix = (value: string | number, optionIndex: number) => {
  const stringValue = String(value);
  return /^[A-Za-z0-9]+$/.test(stringValue) && stringValue.length <= 16
    ? stringValue
    : String(optionIndex + 1);
};

const computeQuestionCell = (
  column: DatasetColumn,
  {
    question,
    answers,
    options,
  }: {
    question: DictionaryQuestion;
    answers: NormalizedAnswer[];
    options: ResearchExportOptions;
  },
): DatasetCell => {
  if (options.repeatedAnswersMode === "json") {
    if (answers.length === 0) return null;
    return JSON.stringify(
      answers.map((answer) =>
        column.isLabelColumn ? answer.valueLabel : answer.value,
      ),
    );
  }

  const answer = findSlotAnswer(column, answers);
  if (!answer) return null;

  if (column.scoreOf) {
    if (column.scoreOf.matrixRowValue === undefined) return answer.score;
    return answer.rowScores?.[String(column.scoreOf.matrixRowValue)] ?? null;
  }

  if (column.otherText) return computeOtherTextCell(column.otherText, answer);

  if (column.videoMetric) {
    const parsedVideoResult = videoWatchResultSchema.safeParse(answer.value);
    if (!parsedVideoResult.success) return null;
    return computeVideoMetricCell(column.videoMetric, parsedVideoResult.data);
  }

  if (column.matrixRowValue !== undefined) {
    if (
      !isObjectResearchValue(answer.value) ||
      videoWatchResultSchema.safeParse(answer.value).success
    )
      return null;
    const rowKey = String(column.matrixRowValue);
    const rowValue: unknown = Object.entries(answer.value).find(
      ([key]) => key === rowKey,
    )?.[1];
    if (rowValue === undefined || rowValue === null) return null;
    const rowValues = Array.isArray(rowValue) ? rowValue : [rowValue];
    if (column.optionValue !== undefined)
      return rowValues.some(
        (value) => String(value) === String(column.optionValue),
      )
        ? 1
        : 0;
    if (column.isLabelColumn) {
      const rowLabel =
        answer.valueLabel &&
        typeof answer.valueLabel === "object" &&
        !Array.isArray(answer.valueLabel)
          ? answer.valueLabel[rowKey]
          : undefined;
      if (rowLabel !== undefined)
        return Array.isArray(rowLabel)
          ? rowLabel.join(options.multipleChoiceSeparator)
          : rowLabel;
    }
    const typedRowValue = coerceResearchValue(rowValue, question.dataType);
    return Array.isArray(typedRowValue) || question.isMultiplePerRow
      ? toListCell(typedRowValue, options.multipleChoiceSeparator)
      : toCell(typedRowValue, options);
  }

  if (column.optionValue !== undefined) {
    const values = Array.isArray(answer.value)
      ? answer.value
      : answer.value !== null
        ? [answer.value]
        : [];
    return values.some((value) => String(value) === String(column.optionValue))
      ? 1
      : 0;
  }

  const cellValue = column.isLabelColumn
    ? (answer.valueLabel ?? answer.value)
    : coerceResearchValue(answer.value, question.dataType);
  if (question.isMultiple || Array.isArray(cellValue))
    return toListCell(cellValue, options.multipleChoiceSeparator);
  return toCell(cellValue, options);
};

const findSlotAnswer = (
  column: DatasetColumn,
  answers: NormalizedAnswer[],
): NormalizedAnswer | undefined => {
  const { loopSlot } = column;
  if (loopSlot)
    return answers.find(
      (answer) =>
        answer.loopBlockId === loopSlot.loopBlockId &&
        (loopSlot.loopItem !== undefined
          ? answer.loopItem === loopSlot.loopItem
          : answer.loopIteration === loopSlot.loopIteration),
    );
  if (column.executionIndex !== undefined)
    return answers.find(
      (answer) => answer.executionIndex === column.executionIndex,
    );
  return answers[answers.length - 1];
};

const computeOtherTextCell = (
  otherText: NonNullable<DatasetColumn["otherText"]>,
  answer: NormalizedAnswer,
): DatasetCell => {
  const otherTexts = answer.otherTexts;
  if (!otherTexts) return null;
  if (otherText.optionValue !== undefined)
    return otherTexts[String(otherText.optionValue)] ?? null;
  const selectedCode = Array.isArray(answer.value)
    ? undefined
    : String(answer.value);
  return (
    (selectedCode !== undefined ? otherTexts[selectedCode] : undefined) ??
    Object.values(otherTexts)[0] ??
    null
  );
};

const computeVideoMetricCell = (
  videoMetric: VideoMetric,
  videoResult: ReturnType<typeof videoWatchResultSchema.parse>,
): DatasetCell => {
  switch (videoMetric) {
    case "STARTED":
      return videoResult.isStarted ? 1 : 0;
    case "COMPLETED":
      return videoResult.isCompleted ? 1 : 0;
    case "WATCHED_SECONDS":
      return videoResult.watchedSeconds;
    case "WATCHED_PCT":
      return videoResult.watchedPercentage;
    case "PAUSES":
      return videoResult.pauseCount;
  }
};

const toListCell = (value: unknown, separator: string): DatasetCell => {
  if (value === null || value === undefined) return null;
  const items: unknown[] = Array.isArray(value) ? value : [value];
  return items
    .map((item) =>
      typeof item === "object" && item !== null
        ? JSON.stringify(item)
        : String(item),
    )
    .join(separator);
};

const toCell = (
  value: NormalizedAnswer["value"] | NormalizedAnswer["valueLabel"],
  options: ResearchExportOptions,
): DatasetCell => {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value))
    return toListCell(value, options.multipleChoiceSeparator);
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "object") return JSON.stringify(value);
  return value;
};

const toColumnType = (dataType: VariableDataType): DatasetColumn["type"] => {
  if (dataType === "datetime") return "datetime";
  if (dataType === "number" || dataType === "boolean") return "numeric";
  return "string";
};

const addQuestionsForUnknownBlocks = (
  dictionary: DatasetDictionary,
  answers: NormalizedAnswer[],
): DatasetDictionary => {
  const knownBlockIds = new Set(
    dictionary.questions.map((question) => question.blockId),
  );
  const unknownAnswersByBlockId = new Map<string, NormalizedAnswer[]>();
  for (const answer of answers) {
    if (knownBlockIds.has(answer.blockId)) continue;
    unknownAnswersByBlockId.set(answer.blockId, [
      ...(unknownAnswersByBlockId.get(answer.blockId) ?? []),
      answer,
    ]);
  }
  if (unknownAnswersByBlockId.size === 0) return dictionary;
  const usedNames = new Set(
    dictionary.questions.map((question) => question.variableName),
  );
  const unknownQuestions = [...unknownAnswersByBlockId].map<DictionaryQuestion>(
    ([blockId, blockAnswers]) => {
      const areAllValuesNumeric = blockAnswers.every(
        (answer) =>
          typeof answer.value === "number" ||
          (typeof answer.value === "string" && isNumericLiteral(answer.value)),
      );
      let variableName = `Q_${blockId}`;
      while (usedNames.has(variableName)) variableName = `${variableName}_X`;
      usedNames.add(variableName);
      return {
        id: blockId,
        blockId,
        blockType: InputBlockType.TEXT,
        kind: "standard",
        variableName,
        label: "(block not found in the exported questionnaire versions)",
        dataType: areAllValuesNumeric ? "number" : "string",
        isMultiple: false,
        options: [],
        missingValues: [],
        versionNumbers: [],
      };
    },
  );
  return {
    ...dictionary,
    questions: [...dictionary.questions, ...unknownQuestions],
  };
};
