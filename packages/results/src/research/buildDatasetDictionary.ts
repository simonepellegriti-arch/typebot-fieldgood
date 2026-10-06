import { BubbleBlockType } from "@typebot.io/blocks-bubbles/constants";
import type { VideoBubbleBlock } from "@typebot.io/blocks-bubbles/video/schema";
import { isVideoWatchTrackingActive } from "@typebot.io/blocks-bubbles/video/watch/isVideoWatchTrackingActive";
import { isInputBlock } from "@typebot.io/blocks-core/helpers";
import { InputBlockType } from "@typebot.io/blocks-inputs/constants";
import { getMatrixCode } from "@typebot.io/blocks-inputs/matrix/helpers/getMatrixCode";
import type { InputBlock } from "@typebot.io/blocks-inputs/schema";
import { getSliderRows } from "@typebot.io/blocks-inputs/slider/helpers/getSliderRows";
import { resolveSliderScale } from "@typebot.io/blocks-inputs/slider/helpers/resolveSliderScale";
import { LogicBlockType } from "@typebot.io/blocks-logic/constants";
import type { Group } from "@typebot.io/groups/schemas";
import type { Variable, VariableDataType } from "@typebot.io/variables/schemas";
import { parseNumericLiteral } from "./coerceResearchValue";
import type {
  DatasetDictionary,
  DictionaryQuestion,
  QuestionOption,
} from "./schemas";
import { systemColumns } from "./schemas";

export type QuestionnaireVersion = {
  versionId?: string | null;
  /** null for the pre-versioning snapshot (current published typebot without version) */
  versionNumber: number | null;
  groups: Group[];
  variables: Variable[];
};

/**
 * Builds the dataset dictionary (codebook source) from one or more questionnaire versions.
 * Questions are identified by block id; column names come from variable names only,
 * so editing a question label never changes the dataset structure.
 * When the same question exists in several versions, the latest version wins for
 * name/label/type and options are merged.
 */
export const buildDatasetDictionary = (
  versions: QuestionnaireVersion[],
): DatasetDictionary => {
  const sortedVersions = [...versions].sort(
    (versionA, versionB) =>
      (versionA.versionNumber ?? 0) - (versionB.versionNumber ?? 0),
  );
  const questionsById = new Map<string, DictionaryQuestion>();
  const variablesById = new Map<string, Variable>();
  const inputVariableIds = new Set<string>();

  for (const version of sortedVersions) {
    for (const variable of version.variables)
      variablesById.set(variable.id, variable);

    for (const { block, precedingText, groupTitle } of listQuestionBlocks(
      version.groups,
    )) {
      const variableId = getQuestionVariableId(block);
      const variable = variableId
        ? version.variables.find((variable) => variable.id === variableId)
        : undefined;
      if (variable) inputVariableIds.add(variable.id);
      const existingQuestion = questionsById.get(block.id);
      if (block.type === BubbleBlockType.VIDEO) {
        questionsById.set(block.id, {
          id: block.id,
          blockId: block.id,
          blockType: BubbleBlockType.VIDEO,
          kind: "video",
          variableId: variable?.id,
          variableName: variable?.name ?? `VIDEO_${block.id}`,
          label: variable?.label ?? precedingText ?? groupTitle,
          dataType: "number",
          isMultiple: false,
          options: [],
          missingValues: [],
          versionNumbers: mergeVersionNumbers(existingQuestion, version),
        });
        continue;
      }
      const isMultiple = isMultipleChoiceBlock(block);
      const rawOptions = parseBlockOptions(block);
      const dataType =
        variable?.dataType ?? inferDataType(block, isMultiple, rawOptions);
      const options = mergeOptions(
        existingQuestion?.options ?? [],
        rawOptions.map((option) => ({
          label: option.label,
          value: isNumericDataType(dataType)
            ? (parseNumericLiteral(String(option.value)) ?? option.value)
            : option.value,
        })),
      );
      const rowEntries = listRowEntries(block);
      const matrixRows = rowEntries
        ? mergeOptions(
            existingQuestion?.matrixRows ?? [],
            rowEntries.map((row, rowIndex) => ({
              value: getMatrixCode(row, rowIndex),
              label: row.label ?? getMatrixCode(row, rowIndex),
            })),
          )
        : undefined;
      const isScale =
        block.type === InputBlockType.SLIDER ||
        block.type === InputBlockType.CONSTANT_SUM;
      const isMultiplePerRow =
        block.type === InputBlockType.MATRIX &&
        block.options?.answerMode === "multiple";
      const otherOptionValues =
        block.type === InputBlockType.CHOICE
          ? mergeCodes(
              existingQuestion?.otherOptionValues ?? [],
              block.items.flatMap((item) => {
                const code = item.value ?? item.content;
                if (!item.hasTextInput || code === undefined) return [];
                return [
                  isNumericDataType(dataType)
                    ? (parseNumericLiteral(code) ?? code)
                    : code,
                ];
              }),
            )
          : undefined;
      questionsById.set(block.id, {
        id: block.id,
        blockId: block.id,
        blockType: block.type,
        kind: matrixRows ? "matrix" : "standard",
        variableId: variable?.id,
        variableName: variable?.name ?? `Q_${block.id}`,
        label:
          variable?.label ??
          getBlockQuestionText(block) ??
          precedingText ??
          groupTitle,
        dataType,
        isMultiple,
        options,
        missingValues: variable?.missingValues ?? [],
        versionNumbers: mergeVersionNumbers(existingQuestion, version),
        ...(matrixRows
          ? {
              matrixRows,
              isMultiplePerRow,
            }
          : {}),
        ...(isScale ? { isScale: true } : {}),
        ...(block.type === InputBlockType.CONSTANT_SUM
          ? { hasTotalColumn: true }
          : {}),
        ...(otherOptionValues && otherOptionValues.length > 0
          ? { otherOptionValues }
          : {}),
        ...(existingQuestion?.hasScores || hasScoredOptions(block)
          ? { hasScores: true }
          : {}),
      });
    }
  }

  const questions = ensureUniqueNames([...questionsById.values()]);
  const reservedNames = new Set<string>([
    ...Object.values(systemColumns),
    ...questions.map((question) => question.variableName),
  ]);

  const variables = [...variablesById.values()]
    .filter(
      (variable) =>
        !inputVariableIds.has(variable.id) && !variable.isSessionVariable,
    )
    .map((variable) => ({
      id: variable.id,
      name: reservedNames.has(variable.name)
        ? `${variable.name}_VAR`
        : variable.name,
      label: variable.label ?? variable.name,
      dataType: variable.dataType ?? "string",
      missingValues: variable.missingValues ?? [],
    }));

  return {
    questions,
    variables,
    loops: buildLoopsDictionary(sortedVersions, questionsById),
  };
};

/** Loop names and item labels (answers loops: labels of the source question options). */
const buildLoopsDictionary = (
  versions: QuestionnaireVersion[],
  questionsById: Map<string, DictionaryQuestion>,
): NonNullable<DatasetDictionary["loops"]> => {
  const loopsById = new Map<
    string,
    NonNullable<DatasetDictionary["loops"]>[number]
  >();
  for (const version of versions)
    for (const group of version.groups)
      for (const block of group.blocks) {
        if (block.type !== LogicBlockType.LOOP) continue;
        const sourceQuestion = block.options?.sourceBlockId
          ? questionsById.get(block.options.sourceBlockId)
          : undefined;
        const itemLabels = Object.fromEntries(
          [
            ...(sourceQuestion?.options ?? []),
            ...(sourceQuestion?.matrixRows ?? []),
          ].map((option) => [String(option.value), option.label]),
        );
        loopsById.set(block.id, {
          blockId: block.id,
          name: block.options?.name?.trim() || group.title || block.id,
          itemLabels,
        });
      }
  return [...loopsById.values()];
};

/** Input blocks and tracked videos (which produce answers) with their preceding text. */
const listQuestionBlocks = (groups: Group[]) =>
  groups.flatMap((group) => {
    let precedingText: string | undefined;
    const questionBlocks: {
      block: InputBlock | VideoBubbleBlock;
      precedingText: string | undefined;
      groupTitle: string;
    }[] = [];
    for (const block of group.blocks) {
      if (block.type === BubbleBlockType.TEXT) {
        const text = extractPlainText(block.content);
        if (text) precedingText = text;
        continue;
      }
      if (
        (block.type === BubbleBlockType.VIDEO &&
          isVideoWatchTrackingActive(block.content)) ||
        isInputBlock(block)
      ) {
        questionBlocks.push({ block, precedingText, groupTitle: group.title });
        precedingText = undefined;
      }
    }
    return questionBlocks;
  });

const getQuestionVariableId = (block: InputBlock | VideoBubbleBlock) =>
  block.type === BubbleBlockType.VIDEO
    ? block.content?.watchTracking?.variableId
    : block.options?.variableId;

const mergeVersionNumbers = (
  existingQuestion: DictionaryQuestion | undefined,
  version: QuestionnaireVersion,
) => [
  ...(existingQuestion?.versionNumbers ?? []),
  ...(version.versionNumber !== null ? [version.versionNumber] : []),
];

const mergeCodes = (
  previousCodes: (string | number)[],
  newCodes: (string | number)[],
) => [
  ...previousCodes,
  ...newCodes.filter(
    (code) =>
      !previousCodes.some((previous) => String(previous) === String(code)),
  ),
];

const extractPlainText = (content: unknown): string | undefined => {
  if (!content || typeof content !== "object") return;
  if ("plainText" in content && typeof content.plainText === "string") {
    const trimmedText = content.plainText.trim();
    if (trimmedText) return trimmedText;
  }
  if ("richText" in content && Array.isArray(content.richText)) {
    const text = content.richText
      .map((node) => collectText(node))
      .join("\n")
      .trim();
    return text || undefined;
  }
};

const collectText = (node: unknown): string => {
  if (!node || typeof node !== "object") return "";
  if ("text" in node && typeof node.text === "string") return node.text;
  if ("children" in node && Array.isArray(node.children))
    return node.children.map((child) => collectText(child)).join("");
  return "";
};

/**
 * Questions exported with one column per row: matrix rows, slider statements
 * (when there are several) and constant sum categories.
 */
const listRowEntries = (
  block: InputBlock,
): { label?: string; value?: string }[] | undefined => {
  if (block.type === InputBlockType.MATRIX) return block.options?.rows ?? [];
  if (block.type === InputBlockType.CONSTANT_SUM)
    return block.options?.items ?? [];
  if (block.type === InputBlockType.SLIDER) {
    const rows = getSliderRows(block.options);
    return rows.length > 1 ? rows : undefined;
  }
};

/** Question text written in the block itself (matrix, slider, constant sum, signature, photo). */
const getBlockQuestionText = (block: InputBlock) => {
  if (
    block.type !== InputBlockType.MATRIX &&
    block.type !== InputBlockType.SLIDER &&
    block.type !== InputBlockType.CONSTANT_SUM &&
    block.type !== InputBlockType.SIGNATURE &&
    block.type !== InputBlockType.PHOTO
  )
    return;
  const singleSliderLabel =
    block.type === InputBlockType.SLIDER &&
    getSliderRows(block.options).length === 1
      ? block.options?.rows?.[0]?.label?.trim()
      : undefined;
  return block.options?.question?.trim() || singleSliderLabel || undefined;
};

const isMultipleChoiceBlock = (block: InputBlock) =>
  (block.type === InputBlockType.CHOICE ||
    block.type === InputBlockType.PICTURE_CHOICE) &&
  Boolean(block.options?.isMultipleChoice);

const parseBlockOptions = (block: InputBlock): QuestionOption[] => {
  if (block.type === InputBlockType.SLIDER) {
    const { min, max } = resolveSliderScale(block.options);
    const middle = (min + max) / 2;
    return [
      { value: min, label: block.options?.minLabel },
      ...(Number.isInteger(middle)
        ? [{ value: middle, label: block.options?.middleLabel }]
        : []),
      { value: max, label: block.options?.maxLabel },
    ].flatMap((option) =>
      option.label?.trim()
        ? [{ value: option.value, label: option.label.trim() }]
        : [],
    );
  }
  if (block.type === InputBlockType.MATRIX)
    return (block.options?.columns ?? []).map((column, columnIndex) => ({
      value: getMatrixCode(column, columnIndex),
      label: column.label ?? getMatrixCode(column, columnIndex),
    }));
  if (block.type === InputBlockType.CHOICE)
    return block.items.flatMap((item) => {
      const label = item.content ?? item.value;
      const value = item.value ?? item.content;
      return label !== undefined && value !== undefined
        ? [{ value, label }]
        : [];
    });
  if (block.type === InputBlockType.PICTURE_CHOICE)
    return block.items.flatMap((item) => {
      const label = item.title ?? item.pictureSrc ?? item.value;
      const value = item.value ?? item.title ?? item.pictureSrc;
      return label !== undefined && value !== undefined
        ? [{ value, label }]
        : [];
    });
  return [];
};

const inferDataType = (
  block: InputBlock,
  isMultiple: boolean,
  options: QuestionOption[],
): VariableDataType => {
  switch (block.type) {
    case InputBlockType.NUMBER:
    case InputBlockType.RATING:
    case InputBlockType.SLIDER:
    case InputBlockType.CONSTANT_SUM:
      return "number";
    case InputBlockType.MATRIX:
    case InputBlockType.CHOICE:
    case InputBlockType.PICTURE_CHOICE: {
      const areAllOptionsNumeric =
        options.length > 0 &&
        options.every(
          (option) => parseNumericLiteral(String(option.value)) !== undefined,
        );
      if (isMultiple) return areAllOptionsNumeric ? "number[]" : "string[]";
      return areAllOptionsNumeric ? "number" : "string";
    }
    default:
      return "string";
  }
};

export const isNumericDataType = (dataType: VariableDataType) =>
  dataType === "number" || dataType === "number[]";

const mergeOptions = (
  previousOptions: QuestionOption[],
  newOptions: QuestionOption[],
): QuestionOption[] => {
  const mergedOptions = [...previousOptions];
  for (const newOption of newOptions) {
    const existingIndex = mergedOptions.findIndex(
      (option) => String(option.value) === String(newOption.value),
    );
    if (existingIndex === -1) mergedOptions.push(newOption);
    else mergedOptions[existingIndex] = newOption;
  }
  return mergedOptions;
};

const ensureUniqueNames = (
  questions: DictionaryQuestion[],
): DictionaryQuestion[] => {
  const usedNames = new Map<string, number>();
  return questions.map((question) => {
    const occurrences = usedNames.get(question.variableName) ?? 0;
    usedNames.set(question.variableName, occurrences + 1);
    if (occurrences === 0) return question;
    return {
      ...question,
      variableName: `${question.variableName}_${occurrences + 1}`,
    };
  });
};

const hasScoredOptions = (block: InputBlock) => {
  if (block.type === InputBlockType.CHOICE)
    return block.items.some((item) => item.score !== undefined);
  if (block.type === InputBlockType.MATRIX)
    return (block.options?.columns ?? []).some(
      (column) => column.score !== undefined,
    );
  return false;
};
