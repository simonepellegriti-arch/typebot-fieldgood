import { BubbleBlockType } from "@typebot.io/blocks-bubbles/constants";
import { InputBlockType } from "@typebot.io/blocks-inputs/constants";
import type { Group } from "@typebot.io/groups/schemas";
import type { Variable } from "@typebot.io/variables/schemas";
import { buildDatasetDictionary } from "../buildDatasetDictionary";
import type { WordOption, WordQuestion } from "./parseQuestionnaireCoding";

export type CodingStatus =
  | "MATCHED"
  | "UNMATCHED"
  | "AMBIGUOUS"
  | "MISSING_IN_WORD"
  | "MISSING_IN_TYPEBOT";

export type TypebotCodingTarget = {
  kind: "item" | "row" | "column";
  id: string;
  label: string;
  /** Current internal value (code) of the option. */
  value: string | undefined;
};

export type TypebotCodingQuestion = {
  blockId: string;
  blockType: string;
  /** 1-based position among the questions of the flow. */
  position: number;
  variableId?: string;
  variableName?: string;
  label: string;
  options: TypebotCodingTarget[];
  rows: TypebotCodingTarget[];
};

export type OptionMapping = {
  wordOption?: WordOption;
  /** matrix: statement rows are mapped separately from scale columns. */
  targetKind: TypebotCodingTarget["kind"];
  targetId?: string;
  status: CodingStatus;
  /** Ambiguous mappings are applied only once confirmed. */
  isConfirmed: boolean;
  isIgnored: boolean;
};

export type QuestionMapping = {
  wordQuestion: WordQuestion;
  status: CodingStatus;
  /** How the match was found (shown in the review screen). */
  matchReason?: "variableName" | "number" | "label" | "similarity";
  similarity: number;
  blockId?: string;
  candidateBlockIds: string[];
  isConfirmed: boolean;
  isIgnored: boolean;
  /** Also give the Typebot variable the Word name (D1): changes the export column name. */
  shouldSetVariableName: boolean;
  /** Apply scores / exclusive / "other, specify" declared in the Word file. */
  shouldApplyDeclaredProperties: boolean;
  options: OptionMapping[];
};

export type CodingProposal = {
  questions: QuestionMapping[];
  /** Typebot questions no Word question was matched to. */
  missingInWord: TypebotCodingQuestion[];
  typebotQuestions: TypebotCodingQuestion[];
};

/**
 * Proposes a mapping between the questions / codes of a Word questionnaire and
 * the Typebot questions, using (in this order) variable name, question number,
 * exact label and text similarity. Nothing is applied here: uncertain matches
 * are AMBIGUOUS and need a confirmation in the review screen.
 */
export const matchQuestionnaireCoding = (
  wordQuestions: WordQuestion[],
  typebot: { groups: Group[]; variables: Variable[] },
): CodingProposal => {
  const typebotQuestions = listTypebotCodingQuestions(typebot);
  const scoredCandidates = wordQuestions.map((wordQuestion) =>
    typebotQuestions
      .map((typebotQuestion) => ({
        typebotQuestion,
        ...scoreQuestionMatch(wordQuestion, typebotQuestion),
      }))
      .filter(({ score }) => score >= minimumCandidateScore)
      .sort((a, b) => b.score - a.score),
  );

  // Greedy assignment by descending score: a Typebot question is used once.
  const assignments = new Map<
    number,
    (typeof scoredCandidates)[number][number]
  >();
  const usedBlockIds = new Set<string>();
  const allPairs = scoredCandidates
    .flatMap((candidates, wordIndex) =>
      candidates.map((candidate) => ({ wordIndex, candidate })),
    )
    .sort((a, b) => b.candidate.score - a.candidate.score);
  for (const { wordIndex, candidate } of allPairs) {
    if (assignments.has(wordIndex)) continue;
    if (usedBlockIds.has(candidate.typebotQuestion.blockId)) continue;
    assignments.set(wordIndex, candidate);
    usedBlockIds.add(candidate.typebotQuestion.blockId);
  }

  const questions = wordQuestions.map((wordQuestion, wordIndex) => {
    const candidates = scoredCandidates[wordIndex] ?? [];
    const assignment = assignments.get(wordIndex);
    const secondBest = candidates.find(
      (candidate) =>
        candidate.typebotQuestion.blockId !==
        assignment?.typebotQuestion.blockId,
    );
    const status: CodingStatus = !assignment
      ? candidates.length > 0
        ? "AMBIGUOUS"
        : "MISSING_IN_TYPEBOT"
      : assignment.score < confidentScore ||
          (secondBest !== undefined &&
            assignment.reason !== "variableName" &&
            assignment.score - secondBest.score < ambiguityMargin)
        ? "AMBIGUOUS"
        : "MATCHED";
    const typebotQuestion = assignment?.typebotQuestion;
    const options = typebotQuestion
      ? matchOptions(wordQuestion, typebotQuestion)
      : [];
    const hasOptionIssue = options.some(
      (option) => option.status !== "MATCHED",
    );
    return {
      wordQuestion,
      status:
        status === "MATCHED" && hasOptionIssue
          ? ("UNMATCHED" satisfies CodingStatus)
          : status,
      matchReason: assignment?.reason,
      similarity: assignment?.score ?? 0,
      blockId: typebotQuestion?.blockId,
      candidateBlockIds: candidates.map(
        (candidate) => candidate.typebotQuestion.blockId,
      ),
      isConfirmed: status === "MATCHED",
      isIgnored: false,
      shouldSetVariableName:
        typebotQuestion !== undefined && !typebotQuestion.variableName,
      shouldApplyDeclaredProperties: true,
      options,
    } satisfies QuestionMapping;
  });

  return {
    questions,
    missingInWord: typebotQuestions.filter(
      (typebotQuestion) => !usedBlockIds.has(typebotQuestion.blockId),
    ),
    typebotQuestions,
  };
};

/** Re-computes option mappings after the user picks another Typebot question. */
export const matchOptions = (
  wordQuestion: WordQuestion,
  typebotQuestion: TypebotCodingQuestion,
): OptionMapping[] => {
  const isMatrix = typebotQuestion.blockType === InputBlockType.MATRIX;
  return [
    ...matchOptionList(
      wordQuestion.options,
      typebotQuestion.options,
      isMatrix ? "column" : "item",
    ),
    ...(isMatrix
      ? matchOptionList(wordQuestion.rows, typebotQuestion.rows, "row")
      : []),
  ];
};

const matchOptionList = (
  wordOptions: WordOption[],
  targets: TypebotCodingTarget[],
  targetKind: TypebotCodingTarget["kind"],
): OptionMapping[] => {
  const usedTargetIds = new Set<string>();
  const mappings: OptionMapping[] = wordOptions.map((wordOption) => {
    const exactTargets = targets.filter(
      (target) =>
        !usedTargetIds.has(target.id) &&
        normalizeText(target.label) === normalizeText(wordOption.label),
    );
    if (exactTargets.length === 1 && exactTargets[0]) {
      usedTargetIds.add(exactTargets[0].id);
      return {
        wordOption,
        targetKind,
        targetId: exactTargets[0].id,
        status: "MATCHED",
        isConfirmed: true,
        isIgnored: false,
      };
    }
    const similarTargets = targets
      .filter((target) => !usedTargetIds.has(target.id))
      .map((target) => ({
        target,
        score: computeTextSimilarity(target.label, wordOption.label),
      }))
      .filter(({ score }) => score >= 0.5)
      .sort((a, b) => b.score - a.score);
    const bestTarget = similarTargets[0]?.target ?? exactTargets[0];
    if (bestTarget) {
      usedTargetIds.add(bestTarget.id);
      return {
        wordOption,
        targetKind,
        targetId: bestTarget.id,
        status: "AMBIGUOUS",
        isConfirmed: false,
        isIgnored: false,
      };
    }
    return {
      wordOption,
      targetKind,
      status: "MISSING_IN_TYPEBOT",
      isConfirmed: false,
      isIgnored: true,
    };
  });
  const missingInWord: OptionMapping[] = targets
    .filter((target) => !usedTargetIds.has(target.id))
    .map((target) => ({
      targetKind,
      targetId: target.id,
      status: "MISSING_IN_WORD",
      isConfirmed: false,
      isIgnored: true,
    }));
  return [...mappings, ...missingInWord];
};

const minimumCandidateScore = 0.35;
const confidentScore = 0.75;
const ambiguityMargin = 0.1;

const scoreQuestionMatch = (
  wordQuestion: WordQuestion,
  typebotQuestion: TypebotCodingQuestion,
): { score: number; reason: QuestionMapping["matchReason"] } => {
  if (
    typebotQuestion.variableName &&
    normalizeName(typebotQuestion.variableName) ===
      normalizeName(wordQuestion.variableName)
  )
    return { score: 1, reason: "variableName" };
  const labelSimilarity = computeTextSimilarity(
    wordQuestion.text,
    typebotQuestion.label,
  );
  if (normalizeText(wordQuestion.text) === normalizeText(typebotQuestion.label))
    return { score: 0.95, reason: "label" };
  const optionSimilarity = computeOptionOverlap(
    wordQuestion.options,
    typebotQuestion.options,
  );
  // A closed question can't be coded on an open one (and vice versa).
  const isKindCompatible =
    wordQuestion.options.length > 0 === typebotQuestion.options.length > 0;
  const similarity =
    (labelSimilarity * 0.7 + optionSimilarity * 0.3) *
    (isKindCompatible ? 1 : 0.6);
  const isSameNumber =
    isKindCompatible &&
    wordQuestion.number !== undefined &&
    String(typebotQuestion.position) === wordQuestion.number;
  if (isSameNumber && similarity < 0.6)
    return { score: Math.max(0.6, similarity), reason: "number" };
  return {
    score: isSameNumber ? Math.min(0.95, similarity + 0.1) : similarity,
    reason: "similarity",
  };
};

const computeOptionOverlap = (
  wordOptions: WordOption[],
  targets: TypebotCodingTarget[],
) => {
  if (wordOptions.length === 0 || targets.length === 0) return 0;
  const targetLabels = new Set(
    targets.map((target) => normalizeText(target.label)),
  );
  const matchingCount = wordOptions.filter((option) =>
    targetLabels.has(normalizeText(option.label)),
  ).length;
  return matchingCount / Math.max(wordOptions.length, targets.length);
};

/** Dice coefficient on word tokens, accents and punctuation ignored. */
const computeTextSimilarity = (textA: string, textB: string) => {
  const tokensA = tokenize(textA);
  const tokensB = tokenize(textB);
  if (tokensA.length === 0 || tokensB.length === 0) return 0;
  const remainingTokensB = [...tokensB];
  let commonCount = 0;
  for (const token of tokensA) {
    const matchIndex = remainingTokensB.indexOf(token);
    if (matchIndex === -1) continue;
    commonCount++;
    remainingTokensB.splice(matchIndex, 1);
  }
  return (2 * commonCount) / (tokensA.length + tokensB.length);
};

const normalizeText = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const tokenize = (text: string) =>
  normalizeText(text)
    .split(" ")
    .filter((token) => token.length > 1);

const normalizeName = (name: string) =>
  name.toUpperCase().replace(/[^A-Z0-9]/g, "");

/** Questions of the flow that can receive codes, with their options. */
export const listTypebotCodingQuestions = ({
  groups,
  variables,
}: {
  groups: Group[];
  variables: Variable[];
}): TypebotCodingQuestion[] => {
  const dictionary = buildDatasetDictionary([
    { versionNumber: null, groups, variables },
  ]);
  const labelsByBlockId = new Map(
    dictionary.questions.map((question) => [question.blockId, question.label]),
  );
  const questions: TypebotCodingQuestion[] = [];
  for (const group of groups)
    for (const block of group.blocks) {
      if (block.type === BubbleBlockType.VIDEO) continue;
      if (!labelsByBlockId.has(block.id)) continue;
      const variableId =
        "options" in block &&
        block.options &&
        typeof block.options === "object" &&
        "variableId" in block.options &&
        typeof block.options.variableId === "string"
          ? block.options.variableId
          : undefined;
      const common = {
        blockId: block.id,
        blockType: block.type,
        position: questions.length + 1,
        variableId,
        variableName: variables.find((variable) => variable.id === variableId)
          ?.name,
        label: labelsByBlockId.get(block.id) ?? "",
      };
      if (block.type === InputBlockType.CHOICE) {
        questions.push({
          ...common,
          options: block.items.map((item) => ({
            kind: "item",
            id: item.id,
            label: item.content ?? "",
            value: item.value ?? item.content,
          })),
          rows: [],
        });
        continue;
      }
      if (block.type === InputBlockType.PICTURE_CHOICE) {
        questions.push({
          ...common,
          options: block.items.map((item) => ({
            kind: "item",
            id: item.id,
            label: item.title ?? "",
            value: item.value ?? item.title,
          })),
          rows: [],
        });
        continue;
      }
      if (block.type === InputBlockType.MATRIX) {
        questions.push({
          ...common,
          options: (block.options?.columns ?? []).map((column) => ({
            kind: "column",
            id: column.id,
            label: column.label ?? "",
            value: column.value,
          })),
          rows: (block.options?.rows ?? []).map((row) => ({
            kind: "row",
            id: row.id,
            label: row.label ?? "",
            value: row.value,
          })),
        });
        continue;
      }
      questions.push({ ...common, options: [], rows: [] });
    }
  return questions;
};
