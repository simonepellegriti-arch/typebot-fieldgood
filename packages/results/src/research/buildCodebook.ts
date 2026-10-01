import { InputBlockType } from "@typebot.io/blocks-inputs/constants";
import type {
  DatasetColumn,
  DatasetDictionary,
  DictionaryQuestion,
  ResearchDataset,
  ResearchExportOptions,
} from "./schemas";
import { interviewStatuses, systemColumns } from "./schemas";

export type CodebookVariable = {
  /** Column name in the CSV / XLSX export */
  name: string;
  /** SPSS-compatible variable name (letters, digits, _ . @ # $; max 64 chars; unique) */
  spssName: string;
  label: string;
  type: "numeric" | "string" | "datetime";
  measure: "nominal" | "ordinal" | "scale";
  valueLabels?: { value: string | number; label: string }[];
  missingValues?: (string | number)[];
  questionId?: string;
  variableId?: string;
  executionIndex?: number;
  optionValue?: string | number;
  /** Loop question columns: loop block and item / iteration represented. */
  loopBlockId?: string;
  loopItem?: string;
  loopIteration?: number;
  /** Score column (value = score, never the answer code). */
  isScore?: boolean;
};

export type Codebook = {
  formatVersion: 1;
  generatedAt: string;
  options: ResearchExportOptions;
  variables: CodebookVariable[];
  multipleResponseSets: {
    name: string;
    label: string;
    type: "dichotomies" | "categories";
    countedValue?: number;
    variables: string[];
  }[];
  questionnaireVersions: {
    versionNumber: number;
    versionId: string;
    publishedAt: string;
  }[];
  notes: string[];
};

/**
 * Metadata needed to write an SPSS .sav file (variable names, labels, value labels,
 * missing values, types, multiple response sets) alongside the CSV export.
 */
export const buildCodebook = ({
  dataset,
  dictionary,
  options,
  questionnaireVersions,
  now = new Date(),
}: {
  dataset: Pick<ResearchDataset, "columns">;
  dictionary: DatasetDictionary;
  options: ResearchExportOptions;
  questionnaireVersions: Codebook["questionnaireVersions"];
  now?: Date;
}): Codebook => {
  const questionsById = new Map(
    dictionary.questions.map((question) => [question.id, question]),
  );
  const spssNames = buildUniqueSpssNames(
    dataset.columns.map((column) => column.name),
  );

  const variables = dataset.columns.map<CodebookVariable>((column, index) => {
    const spssName = spssNames[index]!;
    const question = column.questionId
      ? questionsById.get(column.questionId)
      : undefined;
    if (column.kind === "system")
      return buildSystemCodebookVariable(column, spssName);
    if (column.kind === "variable") {
      const variable = dictionary.variables.find(
        (variable) => variable.name === column.name,
      );
      return {
        name: column.name,
        spssName,
        label: column.label,
        type: column.type,
        measure: column.type === "numeric" ? "scale" : "nominal",
        missingValues: variable?.missingValues.length
          ? variable.missingValues
          : undefined,
        variableId: variable?.id,
      };
    }
    return buildQuestionCodebookVariable(column, { spssName, question });
  });

  return {
    formatVersion: 1,
    generatedAt: now.toISOString(),
    options,
    variables,
    multipleResponseSets: buildMultipleResponseSets(variables, dictionary),
    questionnaireVersions,
    notes: [
      "Timestamps are ISO 8601 strings (UTC unless a time zone was selected, in which case the offset is included).",
      "END_TS of interviews completed before the research data model is the timestamp of the last answer.",
      "Empty cells are system missing (question not asked or not answered).",
      "TYPEBOT_VERSION is empty for interviews started before questionnaire versioning.",
    ],
  };
};

const buildSystemCodebookVariable = (
  column: DatasetColumn,
  spssName: string,
): CodebookVariable => {
  const base = {
    name: column.name,
    spssName,
    label: column.label,
    type: column.type,
  };
  switch (column.name) {
    case systemColumns.isStarted:
    case systemColumns.isCompleted:
      return {
        ...base,
        measure: "nominal",
        valueLabels: [
          { value: 0, label: "No" },
          { value: 1, label: "Yes" },
        ],
      };
    case systemColumns.status:
      return {
        ...base,
        measure: "nominal",
        valueLabels: interviewStatuses.map((status) => ({
          value: status,
          label: status,
        })),
      };
    case systemColumns.durationSeconds:
      return { ...base, measure: "scale" };
    case systemColumns.typebotVersion:
      return { ...base, measure: "ordinal" };
    default:
      return { ...base, measure: "nominal" };
  }
};

const buildQuestionCodebookVariable = (
  column: DatasetColumn,
  {
    spssName,
    question,
  }: { spssName: string; question: DictionaryQuestion | undefined },
): CodebookVariable => {
  const base = {
    name: column.name,
    spssName,
    label: column.label,
    type: column.type,
    questionId: column.questionId,
    variableId: question?.variableId,
    executionIndex: column.executionIndex,
    loopBlockId: column.loopSlot?.loopBlockId,
    loopItem: column.loopSlot?.loopItem,
    loopIteration: column.loopSlot?.loopIteration,
    missingValues: question?.missingValues.length
      ? question.missingValues
      : undefined,
  };
  if (column.scoreOf)
    return {
      ...base,
      missingValues: undefined,
      isScore: true,
      measure: "scale",
    };
  if (column.otherText)
    return { ...base, missingValues: undefined, measure: "nominal" };
  if (column.videoMetric)
    return {
      ...base,
      missingValues: undefined,
      ...(column.videoMetric === "STARTED" || column.videoMetric === "COMPLETED"
        ? {
            measure: "nominal" as const,
            valueLabels: [
              { value: 0, label: "No" },
              { value: 1, label: "Yes" },
            ],
          }
        : { measure: "scale" as const }),
    };
  if (column.optionValue !== undefined)
    return {
      ...base,
      measure: "nominal",
      optionValue: column.optionValue,
      valueLabels: [
        { value: 0, label: "Not selected" },
        { value: 1, label: "Selected" },
      ],
    };
  if (column.isMatrixTotal) return { ...base, measure: "scale" };
  const hasValueLabels =
    !column.isLabelColumn &&
    question !== undefined &&
    question.options.length > 0;
  if (question?.isScale)
    return {
      ...base,
      measure: "scale",
      valueLabels: hasValueLabels
        ? question.options.map((option) => ({
            value: option.value,
            label: option.label,
          }))
        : undefined,
    };
  return {
    ...base,
    measure:
      question?.blockType === InputBlockType.RATING ||
      (question?.kind === "matrix" && column.type === "numeric")
        ? "ordinal"
        : column.type === "numeric" && !hasValueLabels
          ? "scale"
          : "nominal",
    valueLabels: hasValueLabels
      ? question.options.map((option) => ({
          value: option.value,
          label: option.label,
        }))
      : undefined,
  };
};

const buildMultipleResponseSets = (
  variables: CodebookVariable[],
  dictionary: DatasetDictionary,
): Codebook["multipleResponseSets"] =>
  dictionary.questions
    .filter((question) => question.isMultiple)
    .flatMap((question) => {
      const dichotomyVariables = variables.filter(
        (variable) =>
          variable.questionId === question.id &&
          variable.optionValue !== undefined,
      );
      if (dichotomyVariables.length === 0) return [];
      const executionIndexes = [
        ...new Set(
          dichotomyVariables.map((variable) => variable.executionIndex),
        ),
      ];
      return executionIndexes.map((executionIndex) => ({
        name: `$${question.variableName}${executionIndex ? `_${executionIndex}` : ""}`,
        label: question.label,
        type: "dichotomies" as const,
        countedValue: 1,
        variables: dichotomyVariables
          .filter((variable) => variable.executionIndex === executionIndex)
          .map((variable) => variable.spssName),
      }));
    });

const maxSpssNameLength = 64;

export const buildUniqueSpssNames = (columnNames: string[]): string[] => {
  const usedNames = new Set<string>();
  return columnNames.map((columnName) => {
    let spssName = columnName
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^A-Za-z0-9_.@#$]/g, "_");
    if (!/^[A-Za-z@#$]/.test(spssName)) spssName = `V${spssName}`;
    spssName = spssName.replace(/[._]+$/, "") || "V";
    spssName = spssName.slice(0, maxSpssNameLength);
    let uniqueName = spssName;
    let suffix = 2;
    while (usedNames.has(uniqueName.toUpperCase())) {
      const suffixText = `_${suffix}`;
      uniqueName = `${spssName.slice(0, maxSpssNameLength - suffixText.length)}${suffixText}`;
      suffix++;
    }
    usedNames.add(uniqueName.toUpperCase());
    return uniqueName;
  });
};
