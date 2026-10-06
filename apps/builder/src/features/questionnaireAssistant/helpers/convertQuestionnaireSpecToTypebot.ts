import { createId } from "@paralleldrive/cuid2";
import { BubbleBlockType } from "@typebot.io/blocks-bubbles/constants";
import { InputBlockType } from "@typebot.io/blocks-inputs/constants";
import { LogicBlockType } from "@typebot.io/blocks-logic/constants";
import {
  ComparisonOperators,
  LogicalOperator,
} from "@typebot.io/conditions/constants";
import type {
  QuestionnaireCondition,
  QuestionnaireConditionGroup,
  QuestionnaireQuestion,
  QuestionnaireSpec,
} from "../questionnaireSpecSchema";
import { getBotLabels } from "./getBotLabels";

type Block = Record<string, unknown> & { id: string; type: string };
type Group = {
  id: string;
  title: string;
  graphCoordinates: { x: number; y: number };
  blocks: Block[];
};
type Edge = {
  id: string;
  from: { blockId: string; itemId?: string } | { eventId: string };
  to: { groupId: string };
};
type ConditionItem = {
  logicalOperator: LogicalOperator;
  comparisons: {
    id: string;
    variableId: string;
    comparisonOperator: ComparisonOperators;
    value: string;
  }[];
};

/**
 * Builds a v6 bot from a questionnaire spec: one group per question, linked in
 * order. Filters become a condition at the top of the question (skip to the
 * next question), screen-outs a condition after the answer (go to the end
 * message). Each question saves its answer in a variable named after its code,
 * which is also the column name of the SPSS export.
 */
export const convertQuestionnaireSpecToTypebot = (spec: QuestionnaireSpec) => {
  const labels = getBotLabels(spec.language);
  const warnings: string[] = [];
  const edges: Edge[] = [];
  const questions = deduplicateCodes(spec.questions);
  const variables = questions
    .filter((question) => question.type !== "info")
    .map((question) => ({ id: `v${createId()}`, name: question.code }));
  const variableIdByCode = new Map(
    variables.map((variable) => [variable.name, variable.id]),
  );
  const questionTypeByCode = new Map(
    questions.map((question) => [question.code, question.type]),
  );

  const startEventId = createId();
  const introGroup: Group = {
    id: createId(),
    title: "Introduzione",
    graphCoordinates: { x: 0, y: 0 },
    blocks: spec.introText ? [textBubble(spec.introText)] : [],
  };
  const endGroup: Group = {
    id: createId(),
    title: "Fine",
    graphCoordinates: { x: 0, y: 0 },
    blocks: [textBubble(spec.closingText ?? labels.closing)],
  };
  const screenOutGroup: Group = {
    id: createId(),
    title: "Fine anticipata (screen-out)",
    graphCoordinates: { x: 0, y: 0 },
    blocks: [textBubble(spec.screenOutText ?? labels.screenOut)],
  };

  const questionGroups = questions.map((question) => ({
    question,
    group: {
      id: createId(),
      title: question.code,
      graphCoordinates: { x: 0, y: 0 },
      blocks: [] as Block[],
    } satisfies Group,
  }));
  const nextGroupIdAfter = (index: number) =>
    questionGroups[index + 1]?.group.id ?? endGroup.id;

  const toConditionItem = (
    condition: QuestionnaireCondition,
    isNegated: boolean,
  ): ConditionItem | undefined => {
    const variableId = variableIdByCode.get(condition.questionCode);
    if (!variableId) return undefined;
    const isList =
      questionTypeByCode.get(condition.questionCode) === "multiple";
    // anyOf: the answer is one of the codes; noneOf: it isn't.
    const isMatch = (condition.operator === "anyOf") !== isNegated;
    if (
      condition.operator === "lessThan" ||
      condition.operator === "greaterThan"
    ) {
      const value = condition.values[0] ?? "";
      const isLess = (condition.operator === "lessThan") !== isNegated;
      const operator = isNegated
        ? isLess
          ? ComparisonOperators.LESS_OR_EQUAL
          : ComparisonOperators.GREATER_OR_EQUAL
        : isLess
          ? ComparisonOperators.LESS
          : ComparisonOperators.GREATER;
      return {
        logicalOperator: LogicalOperator.AND,
        comparisons: [
          { id: createId(), variableId, comparisonOperator: operator, value },
        ],
      };
    }
    // Multiple choice answers are saved as "1, 3": codes are matched as whole
    // items of the list ("1" never matches "11").
    const matchOperator = isList
      ? ComparisonOperators.MATCHES_REGEX
      : ComparisonOperators.EQUAL;
    const noMatchOperator = isList
      ? ComparisonOperators.NOT_MATCH_REGEX
      : ComparisonOperators.NOT_EQUAL;
    return {
      // "one of these codes" is an OR of equalities, its negation an AND.
      logicalOperator: isMatch ? LogicalOperator.OR : LogicalOperator.AND,
      comparisons: condition.values.map((value) => ({
        id: createId(),
        variableId,
        comparisonOperator: isMatch ? matchOperator : noMatchOperator,
        value: isList ? toListItemPattern(value) : value,
      })),
    };
  };

  /** Skips also when the filtering question wasn't answered (it was itself filtered out). */
  const toUnansweredItems = (group: QuestionnaireConditionGroup) =>
    group.logic === "all" || group.conditions.length === 1
      ? group.conditions.flatMap((condition) => {
          const variableId = variableIdByCode.get(condition.questionCode);
          return variableId
            ? [
                {
                  logicalOperator: LogicalOperator.AND,
                  comparisons: [
                    {
                      id: createId(),
                      variableId,
                      comparisonOperator: ComparisonOperators.IS_EMPTY,
                      value: "",
                    },
                  ],
                },
              ]
            : [];
        })
      : [];

  /** Condition items, any of which is true when `group` is true (or false when negated). */
  const toConditionItems = (
    group: QuestionnaireConditionGroup,
    isNegated: boolean,
    questionCode: string,
  ) => {
    const items = group.conditions.map((condition) =>
      toConditionItem(condition, isNegated),
    );
    if (items.some((item) => !item)) {
      warnings.push(
        `${questionCode}: a condition refers to a question that doesn't exist, it was ignored.`,
      );
      return [];
    }
    const definedItems = items.filter((item) => item !== undefined);
    // all ↔ any when negated (De Morgan).
    const isDisjunction = (group.logic === "any") !== isNegated;
    if (isDisjunction || definedItems.length <= 1) return definedItems;
    const canMergeAsAnd = definedItems.every(
      (item) =>
        item.logicalOperator === LogicalOperator.AND ||
        item.comparisons.length <= 1,
    );
    if (!canMergeAsAnd) {
      warnings.push(
        `${questionCode}: the filter is too complex for a single condition, check it in the editor.`,
      );
      return [];
    }
    return [
      {
        logicalOperator: LogicalOperator.AND,
        comparisons: definedItems.flatMap((item) => item.comparisons),
      },
    ];
  };

  const conditionBlock = (
    items: ConditionItem[],
    targetGroupId: string,
  ): Block => {
    const blockId = createId();
    return {
      id: blockId,
      type: LogicBlockType.CONDITION,
      items: items.map((item) => {
        const itemId = createId();
        const edgeId = createId();
        edges.push({
          id: edgeId,
          from: { blockId, itemId },
          to: { groupId: targetGroupId },
        });
        return { id: itemId, outgoingEdgeId: edgeId, content: item };
      }),
    };
  };

  questionGroups.forEach(({ question, group }, index) => {
    if (question.showIf) {
      const skipItems = toConditionItems(question.showIf, true, question.code);
      if (skipItems.length > 0)
        skipItems.push(...toUnansweredItems(question.showIf));
      if (skipItems.length > 0)
        group.blocks.push(conditionBlock(skipItems, nextGroupIdAfter(index)));
    }
    group.blocks.push(
      ...buildQuestionBlocks(
        question,
        variableIdByCode.get(question.code),
        labels,
      ),
    );
    if (question.terminateIf) {
      const terminateItems = toConditionItems(
        question.terminateIf,
        false,
        question.code,
      );
      if (terminateItems.length > 0)
        group.blocks.push(conditionBlock(terminateItems, screenOutGroup.id));
    }
    const lastBlock = group.blocks.at(-1);
    if (!lastBlock) return;
    const edgeId = createId();
    edges.push({
      id: edgeId,
      from: { blockId: lastBlock.id },
      to: { groupId: nextGroupIdAfter(index) },
    });
    lastBlock.outgoingEdgeId = edgeId;
  });

  // Start → intro (when any) → first question.
  const firstGroupId = questionGroups[0]?.group.id ?? endGroup.id;
  const groups: Group[] = [];
  let startTargetId = firstGroupId;
  if (introGroup.blocks.length > 0) {
    const introLastBlock = introGroup.blocks.at(-1);
    if (introLastBlock) {
      const edgeId = createId();
      edges.push({
        id: edgeId,
        from: { blockId: introLastBlock.id },
        to: { groupId: firstGroupId },
      });
      introLastBlock.outgoingEdgeId = edgeId;
    }
    groups.push(introGroup);
    startTargetId = introGroup.id;
  }
  const startEdgeId = createId();
  edges.push({
    id: startEdgeId,
    from: { eventId: startEventId },
    to: { groupId: startTargetId },
  });
  groups.push(...questionGroups.map(({ group }) => group), endGroup);
  if (edges.some((edge) => edge.to.groupId === screenOutGroup.id))
    groups.push(screenOutGroup);

  layoutGroups(groups);

  return {
    typebot: {
      version: "6" as const,
      name: spec.title.trim() || "Questionario",
      groups,
      variables,
      edges,
      events: [
        {
          id: startEventId,
          type: "start" as const,
          graphCoordinates: { x: -300, y: 0 },
          outgoingEdgeId: startEdgeId,
        },
      ],
      theme: {},
      settings: {},
    },
    warnings,
  };
};

const buildQuestionBlocks = (
  question: QuestionnaireQuestion,
  variableId: string | undefined,
  labels: ReturnType<typeof getBotLabels>,
): Block[] => {
  const questionBubble = () =>
    textBubble(question.text, question.instructions ?? undefined);
  const rows = question.rows.map((row) => ({
    id: createId(),
    label: row.label,
    value: row.code,
  }));
  const choiceItems = () =>
    question.options.map((option) => ({
      id: createId(),
      content: option.label,
      value: option.code,
      ...(option.isExclusive ? { isExclusive: true } : {}),
      ...(option.isOther
        ? { hasTextInput: true, textInputRequired: true }
        : {}),
    }));

  switch (question.type) {
    case "info":
      return [questionBubble()];
    case "single":
    case "multiple":
      return [
        questionBubble(),
        {
          id: createId(),
          type: InputBlockType.CHOICE,
          items: choiceItems(),
          options: {
            variableId,
            isMultipleChoice: question.type === "multiple",
            buttonLabel: labels.send,
            ...(question.maxSelections
              ? { maxSelections: question.maxSelections }
              : {}),
            ...(question.isRandomized ? { areItemsRandomized: true } : {}),
          },
        },
      ];
    case "open":
    case "openLong":
      return [
        questionBubble(),
        {
          id: createId(),
          type: InputBlockType.TEXT,
          options: {
            variableId,
            isLong: question.type === "openLong",
            labels: { placeholder: labels.typeAnswer, button: labels.send },
          },
        },
      ];
    case "number":
      return [
        questionBubble(),
        {
          id: createId(),
          type: InputBlockType.NUMBER,
          options: {
            variableId,
            ...(question.scale
              ? { min: question.scale.min, max: question.scale.max }
              : {}),
            labels: { placeholder: labels.typeNumber, button: labels.send },
          },
        },
      ];
    case "rating": {
      const min = question.scale?.min ?? 0;
      const max = question.scale?.max ?? 10;
      return [
        questionBubble(),
        {
          id: createId(),
          type: InputBlockType.RATING,
          options: {
            variableId,
            buttonType: "Numbers",
            startsAt: min,
            length: Math.max(2, max - min + 1),
            labels: {
              left: question.scale?.minLabel ?? undefined,
              right: question.scale?.maxLabel ?? undefined,
              button: labels.send,
            },
            isOneClickSubmitEnabled: true,
          },
        },
      ];
    }
    case "matrix":
      return [
        {
          id: createId(),
          type: InputBlockType.MATRIX,
          options: {
            variableId,
            question: joinText(question.text, question.instructions),
            rows,
            columns: question.options.map((option) => ({
              id: createId(),
              label: option.label,
              value: option.code,
            })),
            answerMode: "single",
            ...(question.isRandomized ? { areRowsRandomized: true } : {}),
            buttonLabel: labels.send,
          },
        },
      ];
    case "slider":
      return [
        {
          id: createId(),
          type: InputBlockType.SLIDER,
          options: {
            variableId,
            question: joinText(question.text, question.instructions),
            rows,
            min: question.scale?.min ?? -100,
            max: question.scale?.max ?? 100,
            minLabel: question.scale?.minLabel ?? undefined,
            maxLabel: question.scale?.maxLabel ?? undefined,
            ...(question.isRandomized ? { areRowsRandomized: true } : {}),
            buttonLabel: labels.send,
          },
        },
      ];
    case "constantSum":
      return [
        {
          id: createId(),
          type: InputBlockType.CONSTANT_SUM,
          options: {
            variableId,
            question: joinText(question.text, question.instructions),
            items: rows,
            total: question.total ?? 100,
            ...(question.isRandomized ? { areItemsRandomized: true } : {}),
            buttonLabel: labels.send,
          },
        },
      ];
    case "signature":
      return [
        {
          id: createId(),
          type: InputBlockType.SIGNATURE,
          options: {
            variableId,
            question: joinText(question.text, question.instructions),
            buttonLabel: labels.send,
          },
        },
      ];
    case "email":
    case "phone":
    case "date":
      return [
        questionBubble(),
        {
          id: createId(),
          type:
            question.type === "email"
              ? InputBlockType.EMAIL
              : question.type === "phone"
                ? InputBlockType.PHONE
                : InputBlockType.DATE,
          options: { variableId },
        },
      ];
  }
};

const textBubble = (text: string, note?: string): Block => ({
  id: createId(),
  type: BubbleBlockType.TEXT,
  content: {
    richText: [
      ...text
        .split(/\n+/)
        .filter((line) => line.trim())
        .map((line) => ({ type: "p", children: [{ text: line.trim() }] })),
      ...(note
        ? [{ type: "p", children: [{ text: note, italic: true }] }]
        : []),
    ],
  },
});

const toListItemPattern = (code: string) =>
  `(^|,\\s*)${code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s*,|$)`;

const joinText = (text: string, instructions: string | null) =>
  instructions ? `${text}\n${instructions}` : text;

/** Codes are variable and column names: unique, letters / numbers / _ only. */
const deduplicateCodes = (questions: QuestionnaireQuestion[]) => {
  const usedCodes = new Set<string>();
  return questions.map((question, index) => {
    const baseCode =
      question.code
        .trim()
        .replace(/[^\p{L}\p{N}_]+/gu, "_")
        .replace(/^_+|_+$/g, "") || `Q${index + 1}`;
    let code = /^\p{N}/u.test(baseCode) ? `Q${baseCode}` : baseCode;
    for (let suffix = 2; usedCodes.has(code); suffix++)
      code = `${baseCode}_${suffix}`;
    usedCodes.add(code);
    return code === question.code ? question : { ...question, code };
  });
};

/** Rows of 4 groups, left to right, so the graph reads like the questionnaire. */
const layoutGroups = (groups: Group[]) => {
  groups.forEach((group, index) => {
    group.graphCoordinates = {
      x: (index % 4) * 420,
      y: Math.floor(index / 4) * 420,
    };
  });
};
