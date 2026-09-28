import { InputBlockType } from "@typebot.io/blocks-inputs/constants";
import type {
  VariableDataType,
  VariableWithValue,
} from "@typebot.io/variables/schemas";
import { formatInTimeZone } from "date-fns-tz";
import type { ResearchAnswer } from "../schemas/answers";
import { coerceResearchValue, isNumericLiteral } from "./coerceResearchValue";
import { computeInterviewTiming } from "./computeInterviewTiming";
import { normalizeResultAnswers } from "./normalizeResultAnswers";
import type {
  DatasetCell,
  DatasetColumn,
  DatasetDictionary,
  DictionaryQuestion,
  NormalizedAnswer,
  ResearchDataset,
  ResearchExportOptions,
} from "./schemas";
import { systemColumns } from "./schemas";

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
}): ResearchDataset & { dictionary: DatasetDictionary } => {
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

  const maxExecutionsByQuestionId = new Map<string, number>();
  for (const { answers } of preparedResults)
    for (const answer of answers)
      maxExecutionsByQuestionId.set(
        answer.blockId,
        Math.max(
          maxExecutionsByQuestionId.get(answer.blockId) ?? 0,
          answer.executionIndex,
        ),
      );

  const columns: DatasetColumn[] = [
    ...buildSystemColumns(),
    ...extendedDictionary.questions.flatMap((question) =>
      buildQuestionColumns(question, {
        options,
        maxExecutions: maxExecutionsByQuestionId.get(question.blockId) ?? 1,
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

  return { columns, rows, dictionary: extendedDictionary };
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

const buildQuestionColumns = (
  question: DictionaryQuestion,
  {
    options,
    maxExecutions,
  }: { options: ResearchExportOptions; maxExecutions: number },
): DatasetColumn[] => {
  const executionSlots =
    options.repeatedAnswersMode === "columns" && maxExecutions > 1
      ? Array.from({ length: maxExecutions }, (_, index) => index + 1)
      : [undefined];

  return executionSlots.flatMap((executionIndex) => {
    const baseName =
      executionIndex !== undefined
        ? `${question.variableName}_${executionIndex}`
        : question.variableName;
    const baseLabel =
      executionIndex !== undefined
        ? `${question.label} (#${executionIndex})`
        : question.label;

    if (
      question.isMultiple &&
      options.multipleChoiceMode === "dichotomous" &&
      options.repeatedAnswersMode !== "json"
    )
      return question.options.map<DatasetColumn>((option, optionIndex) => ({
        name: `${baseName}_${toOptionSuffix(option.value, optionIndex)}`,
        kind: "question",
        questionId: question.id,
        optionValue: option.value,
        executionIndex,
        label: `${baseLabel}: ${option.label}`,
        type: "numeric",
      }));

    const valueColumn: DatasetColumn = {
      name: baseName,
      kind: "question",
      questionId: question.id,
      executionIndex,
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
      return [valueColumn];
    return [
      valueColumn,
      {
        ...valueColumn,
        name: `${baseName}_LABEL`,
        isLabelColumn: true,
        label: `${baseLabel} (label)`,
        type: "string",
      },
    ];
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

  const answer =
    column.executionIndex !== undefined
      ? answers.find(
          (answer) => answer.executionIndex === column.executionIndex,
        )
      : answers[answers.length - 1];
  if (!answer) return null;

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

const toListCell = (
  value: NormalizedAnswer["value"] | NormalizedAnswer["valueLabel"],
  separator: string,
): DatasetCell => {
  if (value === null || value === undefined) return null;
  const items: (string | number | boolean)[] = Array.isArray(value)
    ? value
    : [value];
  return items.map((item) => String(item)).join(separator);
};

const toCell = (
  value: NormalizedAnswer["value"] | NormalizedAnswer["valueLabel"],
  options: ResearchExportOptions,
): DatasetCell => {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value))
    return toListCell(value, options.multipleChoiceSeparator);
  if (typeof value === "boolean") return value ? 1 : 0;
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
