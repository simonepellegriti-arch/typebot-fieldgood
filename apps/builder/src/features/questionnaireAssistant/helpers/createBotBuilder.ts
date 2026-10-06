import { createId } from "@paralleldrive/cuid2";
import { BubbleBlockType } from "@typebot.io/blocks-bubbles/constants";
import { InputBlockType } from "@typebot.io/blocks-inputs/constants";
import { IntegrationBlockType } from "@typebot.io/blocks-integrations/constants";
import { LogicBlockType } from "@typebot.io/blocks-logic/constants";
import type {
  ComparisonOperators,
  LogicalOperator,
} from "@typebot.io/conditions/constants";

export type BotBlock = Record<string, unknown> & {
  id: string;
  type: string;
  outgoingEdgeId?: string;
};

export type BotGroup = {
  id: string;
  title: string;
  graphCoordinates: { x: number; y: number };
  blocks: BotBlock[];
};

type EdgeTarget = { groupId: string; blockId?: string };

/** Where an edge goes, known only once every group is built. */
export type LazyTarget = () => EdgeTarget;

export type ConditionItem = {
  logicalOperator: LogicalOperator;
  comparisons: {
    id: string;
    variableId: string;
    comparisonOperator: ComparisonOperators;
    value: string;
  }[];
};

export type GroupBuilder = ReturnType<
  ReturnType<typeof createBotBuilder>["createGroup"]
>;

/**
 * Small toolkit to write a v6 bot by hand: variables by name, groups whose
 * edges are resolved at the end (so a block can jump to a group or block that
 * doesn't exist yet), and factories for the blocks the questionnaire
 * assistant uses.
 */
export const createBotBuilder = () => {
  const variables: { id: string; name: string }[] = [];
  const groups: { group: BotGroup; getNextTarget: () => LazyTarget }[] = [];
  const edges: {
    id: string;
    from: { blockId: string; itemId?: string } | { eventId: string };
    to: LazyTarget;
  }[] = [];

  const variable = (name: string) => {
    const existing = variables.find((candidate) => candidate.name === name);
    if (existing) return existing.id;
    const id = `v${createId()}`;
    variables.push({ id, name });
    return id;
  };

  const hasVariable = (name: string) =>
    variables.some((candidate) => candidate.name === name);

  const addEdge = (
    from: { blockId: string; itemId?: string } | { eventId: string },
    to: LazyTarget,
  ) => {
    const id = createId();
    edges.push({ id, from, to });
    return id;
  };

  const createGroup = (title: string) => {
    const group: BotGroup = {
      id: createId(),
      title,
      graphCoordinates: { x: 0, y: 0 },
      blocks: [],
    };
    let nextTarget: LazyTarget | undefined;
    groups.push({
      group,
      getNextTarget: () => nextTarget ?? (() => ({ groupId: group.id })),
    });
    const builder = {
      group,
      /** The group, or where it would go next when it stayed empty. */
      start: (): LazyTarget => () =>
        group.blocks.length > 0
          ? { groupId: group.id }
          : (nextTarget ?? (() => ({ groupId: group.id })))(),
      add: (...blocks: BotBlock[]) => {
        group.blocks.push(...blocks);
        return builder;
      },
      /** Position of the next block to be added, to jump to it. */
      mark: () => group.blocks.length,
      /** The block at `position`, or where the group goes next when nothing was added there. */
      at:
        (position: number): LazyTarget =>
        () => {
          const block = group.blocks[position];
          if (block) return { groupId: group.id, blockId: block.id };
          return (nextTarget ?? (() => ({ groupId: group.id })))();
        },
      /** Where the group goes after its last block. */
      setNext: (target: LazyTarget) => {
        nextTarget = target;
        return builder;
      },
      isEmpty: () => group.blocks.length === 0,
    };
    return builder;
  };

  const textBubble = (text: string, note?: string): BotBlock => ({
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

  const embedBubble = (url: string): BotBlock => ({
    id: createId(),
    type: BubbleBlockType.EMBED,
    content: { url, height: 400 },
  });

  /**
   * Set variable from a JavaScript expression (variables written as {{name}}).
   * Typebot adds "return" only to code without one: expressions with inner
   * functions get it explicitly.
   */
  const setVariable = (name: string, expression: string): BotBlock => ({
    id: createId(),
    type: LogicBlockType.SET_VARIABLE,
    options: {
      variableId: variable(name),
      expressionToEvaluate:
        expression.includes("return ") && !expression.startsWith("return ")
          ? `return ${expression}`
          : expression,
    },
  });

  const condition = (
    items: { content: ConditionItem; to: LazyTarget }[],
  ): BotBlock => {
    const blockId = createId();
    return {
      id: blockId,
      type: LogicBlockType.CONDITION,
      items: items.map(({ content, to }) => {
        const itemId = createId();
        return {
          id: itemId,
          outgoingEdgeId: addEdge({ blockId, itemId }, to),
          content,
        };
      }),
    };
  };

  /** Single choice with one button per item, each with its own route. */
  const buttons = (
    items: { label: string; value?: string; to?: LazyTarget }[],
    variableName?: string,
  ): BotBlock => {
    const blockId = createId();
    return {
      id: blockId,
      type: InputBlockType.CHOICE,
      items: items.map(({ label, value, to }) => {
        const itemId = createId();
        return {
          id: itemId,
          content: label,
          ...(value ? { value } : {}),
          ...(to ? { outgoingEdgeId: addEdge({ blockId, itemId }, to) } : {}),
        };
      }),
      options: variableName ? { variableId: variable(variableName) } : {},
    };
  };

  const httpRequest = ({
    method,
    url,
    body,
    authorizationVariable,
    responseMapping = [],
  }: {
    method: "GET" | "POST" | "PATCH";
    url: string;
    body?: string;
    authorizationVariable: string;
    responseMapping?: { bodyPath: string; variableName: string }[];
  }): BotBlock => ({
    id: createId(),
    type: IntegrationBlockType.HTTP_REQUEST,
    options: {
      isCustomBody: Boolean(body),
      timeout: 25,
      webhook: {
        method,
        url,
        headers: [
          { id: createId(), key: "Content-Type", value: "application/json" },
          {
            id: createId(),
            key: "Authorization",
            value: `Bearer {{${authorizationVariable}}}`,
          },
        ],
        ...(body ? { body } : {}),
      },
      responseVariableMapping: responseMapping.map((mapping) => ({
        id: createId(),
        bodyPath: mapping.bodyPath,
        variableId: variable(mapping.variableName),
      })),
    },
  });

  const transcription = ({
    credentialsId,
    audioUrlVariable,
    resultVariable,
  }: {
    credentialsId: string;
    audioUrlVariable: string;
    resultVariable: string;
  }): BotBlock => ({
    id: createId(),
    type: "openai",
    options: {
      credentialsId,
      action: "Create transcription",
      url: `{{${audioUrlVariable}}}`,
      model: "gpt-4o-transcribe",
      transcriptionVariableId: variable(resultVariable),
    },
  });

  const generateText = ({
    credentialsId,
    prompt,
    resultVariable,
    description,
  }: {
    credentialsId: string;
    prompt: string;
    resultVariable: string;
    description: string;
  }): BotBlock => ({
    id: createId(),
    type: "openai",
    options: {
      credentialsId,
      action: "Generate variables",
      model: "gpt-4.1",
      prompt,
      variablesToExtract: [
        {
          type: "string",
          variableId: variable(resultVariable),
          description,
          isRequired: true,
        },
      ],
    },
  });

  /** Final bot: edges resolved, groups laid out in rows of four. */
  const build = ({ startTarget }: { startTarget: LazyTarget }) => {
    for (const { group, getNextTarget } of groups) {
      const lastBlock = group.blocks.at(-1);
      if (!lastBlock || lastBlock.outgoingEdgeId) continue;
      const target = getNextTarget()();
      if (target.groupId === group.id && !target.blockId) continue;
      lastBlock.outgoingEdgeId = addEdge(
        { blockId: lastBlock.id },
        () => target,
      );
    }
    const startEventId = createId();
    const startEdgeId = addEdge({ eventId: startEventId }, startTarget);
    const keptGroups = groups
      .map(({ group }) => group)
      .filter((group) => group.blocks.length > 0);
    keptGroups.forEach((group, index) => {
      group.graphCoordinates = {
        x: (index % 4) * 420,
        y: Math.floor(index / 4) * 420,
      };
    });
    return {
      groups: keptGroups,
      variables,
      edges: edges.map((edge) => ({ ...edge, to: edge.to() })),
      events: [
        {
          id: startEventId,
          type: "start" as const,
          graphCoordinates: { x: -300, y: 0 },
          outgoingEdgeId: startEdgeId,
        },
      ],
    };
  };

  return {
    variable,
    hasVariable,
    createGroup,
    textBubble,
    embedBubble,
    setVariable,
    condition,
    buttons,
    httpRequest,
    transcription,
    generateText,
    build,
  };
};
