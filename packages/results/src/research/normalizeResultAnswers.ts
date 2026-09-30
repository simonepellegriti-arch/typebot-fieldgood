import type { ResearchAnswer } from "../schemas/answers";
import {
  coerceResearchValue,
  parseNumericLiteral,
} from "./coerceResearchValue";
import { isObjectResearchValue } from "./isObjectResearchValue";
import type {
  DictionaryQuestion,
  NormalizedAnswer,
  QuestionOption,
} from "./schemas";

/**
 * Returns the answers of a result in a structured form, whatever the format they were saved with.
 * - Answers saved before the research data model (no `value`, no `executionIndex`) are normalized on read:
 *   legacy multiple choice strings ("A, B, C") are matched against the known options.
 * - Answers to the same block are never merged: each execution keeps its own index.
 */
export const normalizeResultAnswers = (
  answers: ResearchAnswer[],
  questionsByBlockId: Map<string, DictionaryQuestion>,
): NormalizedAnswer[] => {
  const sortedAnswers = answers
    .map((answer, originalIndex) => ({ answer, originalIndex }))
    .sort(
      (a, b) =>
        (a.answer.createdAt?.getTime() ?? 0) -
          (b.answer.createdAt?.getTime() ?? 0) ||
        a.originalIndex - b.originalIndex,
    )
    .map(({ answer }) => answer);

  const usedExecutionIndexesByBlockId = new Map<string, Set<number>>();
  for (const answer of sortedAnswers)
    if (answer.executionIndex)
      getOrCreateSet(usedExecutionIndexesByBlockId, answer.blockId).add(
        answer.executionIndex,
      );

  return sortedAnswers.map((answer) => {
    const usedIndexes = getOrCreateSet(
      usedExecutionIndexesByBlockId,
      answer.blockId,
    );
    let executionIndex = answer.executionIndex ?? undefined;
    if (!executionIndex) {
      executionIndex = 1;
      while (usedIndexes.has(executionIndex)) executionIndex++;
      usedIndexes.add(executionIndex);
    }
    const question = questionsByBlockId.get(answer.blockId);
    const { value, valueLabel } = parseStructuredValue(answer, question);
    return {
      blockId: answer.blockId,
      executionIndex,
      createdAt: answer.createdAt,
      value,
      valueLabel,
      otherTexts: answer.otherTexts ?? null,
      score: answer.score ?? null,
      rowScores: answer.details?.rowScores ?? null,
      loopBlockId: answer.loopBlockId ?? null,
      loopIteration: answer.loopIteration ?? null,
      loopItem: answer.loopItem ?? null,
      content: answer.content,
    };
  });
};

const parseStructuredValue = (
  answer: ResearchAnswer,
  question: DictionaryQuestion | undefined,
): Pick<NormalizedAnswer, "value" | "valueLabel"> => {
  if (!question)
    return {
      value: answer.value ?? answer.content,
      valueLabel: answer.valueLabel ?? null,
    };

  // Matrix rows and video watch results are stored as typed objects.
  if (question.kind !== "standard")
    return {
      value: isObjectResearchValue(answer.value) ? answer.value : null,
      valueLabel: answer.valueLabel ?? null,
    };

  if (answer.value !== null && answer.value !== undefined) {
    const value = isObjectResearchValue(answer.value)
      ? JSON.stringify(answer.value)
      : coerceResearchValue(answer.value, question.dataType);
    return {
      value,
      valueLabel:
        answer.valueLabel ?? findLabels(value, question.options) ?? null,
    };
  }

  if (question.isMultiple) {
    const matchedOptions = parseLegacyMultipleChoiceContent(
      answer.content,
      question.options,
    );
    return {
      value: coerceResearchValue(
        matchedOptions.map((option) => option.value),
        question.dataType,
      ),
      valueLabel: matchedOptions.map((option) => option.label),
    };
  }

  if (question.options.length > 0) {
    const matchedOption = findOptionByValueOrLabel(
      answer.content,
      question.options,
    );
    return {
      value: coerceResearchValue(
        matchedOption?.value ?? answer.content,
        question.dataType,
      ),
      valueLabel: matchedOption?.label ?? answer.content,
    };
  }

  return {
    value: coerceResearchValue(
      question.dataType === "number"
        ? (parseNumericLiteral(answer.content) ?? answer.content)
        : answer.content,
      question.dataType,
    ),
    valueLabel: null,
  };
};

const legacySeparator = ", ";

/**
 * Legacy multiple choice answers were saved as `values.join(", ")`.
 * Options are matched greedily (longest first) on separator boundaries so that
 * labels containing commas ("Red, dark") are still recognized.
 * Unknown fragments are kept as free values.
 */
export const parseLegacyMultipleChoiceContent = (
  content: string,
  options: QuestionOption[],
): QuestionOption[] => {
  const candidates = options
    .flatMap((option) => [
      { text: String(option.value), option },
      { text: option.label, option },
    ])
    .filter((candidate) => candidate.text.length > 0)
    .sort((a, b) => b.text.length - a.text.length);

  const matchedOptions: QuestionOption[] = [];
  let position = 0;
  while (position < content.length) {
    const matchedCandidate = candidates.find(
      (candidate) =>
        content.startsWith(candidate.text, position) &&
        isAtSeparatorBoundary(content, position + candidate.text.length),
    );
    if (matchedCandidate) {
      if (!matchedOptions.includes(matchedCandidate.option))
        matchedOptions.push(matchedCandidate.option);
      position += matchedCandidate.text.length + legacySeparator.length;
      continue;
    }
    const nextSeparatorIndex = content.indexOf(legacySeparator, position);
    const unknownFragment = content
      .slice(
        position,
        nextSeparatorIndex === -1 ? content.length : nextSeparatorIndex,
      )
      .trim();
    if (unknownFragment)
      matchedOptions.push({ value: unknownFragment, label: unknownFragment });
    position =
      nextSeparatorIndex === -1
        ? content.length
        : nextSeparatorIndex + legacySeparator.length;
  }
  return matchedOptions;
};

const isAtSeparatorBoundary = (content: string, index: number) =>
  index === content.length || content.startsWith(legacySeparator, index);

const findOptionByValueOrLabel = (
  content: string,
  options: QuestionOption[],
) => {
  const trimmedContent = content.trim();
  return (
    options.find((option) => String(option.value).trim() === trimmedContent) ??
    options.find((option) => option.label.trim() === trimmedContent)
  );
};

const findLabels = (
  value: NormalizedAnswer["value"],
  options: QuestionOption[],
): string | string[] | undefined => {
  if (value === null || options.length === 0 || isObjectResearchValue(value))
    return;
  const findLabel = (singleValue: string | number | boolean) =>
    options.find((option) => String(option.value) === String(singleValue))
      ?.label ?? String(singleValue);
  if (Array.isArray(value)) return value.map((item) => findLabel(item));
  return findLabel(value);
};

const getOrCreateSet = <T>(map: Map<string, Set<T>>, key: string): Set<T> => {
  const existingSet = map.get(key);
  if (existingSet) return existingSet;
  const newSet = new Set<T>();
  map.set(key, newSet);
  return newSet;
};
