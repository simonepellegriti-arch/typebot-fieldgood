import type { Block } from "@typebot.io/blocks-core/schemas/schema";
import { InputBlockType } from "@typebot.io/blocks-inputs/constants";
import { getMatrixCode } from "@typebot.io/blocks-inputs/matrix/helpers/getMatrixCode";
import { parseLoopItems } from "@typebot.io/blocks-logic/loop/parseLoopItems";
import type { LoopBlock } from "@typebot.io/blocks-logic/loop/schema";
import type { SessionState } from "@typebot.io/chat-session/schemas";
import { executeCondition } from "@typebot.io/conditions/executeCondition";
import { getBlockById } from "@typebot.io/groups/helpers/getBlockById";
import type { SessionStore } from "@typebot.io/runtime-session-store";
import type {
  SetVariableHistoryItem,
  VariableWithUnknowValue,
} from "@typebot.io/variables/schemas";
import { addVirtualEdge } from "../../../addPortalEdge";
import type { ExecuteLogicResponse } from "../../../types";
import { updateVariablesInSession } from "../../../updateVariablesInSession";

type LoopItem = { code: string; label: string };

/**
 * Loop / cycle of questions.
 * First visit: resolves the items and starts iteration 0. Each iteration sets the
 * current item / index / iteration number variables, queues a "come back" edge to
 * this block and jumps to the body group. When the body group ends (no outgoing
 * edge) the queued edge brings the flow back here and the next item starts.
 * After the last item (or when the break condition is met) the loop state is
 * removed and the flow leaves through the block's own output.
 */
export const executeLoopBlock = (
  block: LoopBlock,
  { state, sessionStore }: { state: SessionState; sessionStore: SessionStore },
): ExecuteLogicResponse => {
  const { typebot } = state.typebotsQueue[0];
  const bodyGroup = typebot.groups.find(
    (group) => group.id === block.options?.bodyGroupId,
  );
  if (!bodyGroup) return { outgoingEdgeId: undefined };
  if (bodyGroup.blocks.some((bodyBlock) => bodyBlock.id === block.id))
    return {
      outgoingEdgeId: undefined,
      logs: [
        {
          context: "Error while executing Loop block",
          description:
            "The loop body can't be the group containing the loop block",
        },
      ],
    };

  const existingLoop = state.loops?.find((loop) => loop.blockId === block.id);
  const items = existingLoop?.items ?? resolveLoopItems(block, state);
  let nextIndex = existingLoop ? existingLoop.index + 1 : 0;
  let newState = state;
  const setVariableHistory: SetVariableHistoryItem[] = [];

  while (nextIndex < items.length) {
    const item = items[nextIndex]!;
    const iterationVariables = buildIterationVariables(block, newState, {
      item,
      index: nextIndex,
    });
    const { updatedState, newSetVariableHistory } = updateVariablesInSession({
      state: newState,
      newVariables: iterationVariables,
      currentBlockId: block.id,
    });
    newState = updatedState;
    setVariableHistory.push(...newSetVariableHistory);

    const variables = newState.typebotsQueue[0].typebot.variables;
    if (
      block.options?.breakCondition?.isEnabled &&
      block.options.breakCondition.condition &&
      executeCondition(block.options.breakCondition.condition, {
        variables,
        sessionStore,
      })
    )
      break;
    if (
      block.options?.continueCondition?.isEnabled &&
      block.options.continueCondition.condition &&
      executeCondition(block.options.continueCondition.condition, {
        variables,
        sessionStore,
      })
    ) {
      nextIndex++;
      continue;
    }

    return startIteration(block, newState, {
      bodyGroupId: bodyGroup.id,
      items,
      index: nextIndex,
      setVariableHistory,
    });
  }

  return {
    outgoingEdgeId: undefined,
    newSessionState: {
      ...newState,
      loops: newState.loops?.filter((loop) => loop.blockId !== block.id),
    },
    newSetVariableHistory: setVariableHistory,
  };
};

const startIteration = (
  block: LoopBlock,
  state: SessionState,
  {
    bodyGroupId,
    items,
    index,
    setVariableHistory,
  }: {
    bodyGroupId: string;
    items: LoopItem[];
    index: number;
    setVariableHistory: SetVariableHistoryItem[];
  },
): ExecuteLogicResponse => {
  const loopGroup = state.typebotsQueue[0].typebot.groups.find((group) =>
    group.blocks.some((groupBlock) => groupBlock.id === block.id),
  );
  if (!loopGroup) return { outgoingEdgeId: undefined };

  const { newSessionState: stateWithReturnEdge, edgeId: returnEdgeId } =
    addVirtualEdge(state, { to: { groupId: loopGroup.id, blockId: block.id } });
  const { newSessionState: stateWithBodyEdge, edgeId: bodyEdgeId } =
    addVirtualEdge(stateWithReturnEdge, { to: { groupId: bodyGroupId } });

  const otherLoops = (stateWithBodyEdge.loops ?? []).filter(
    (loop) => loop.blockId !== block.id,
  );
  return {
    outgoingEdgeId: bodyEdgeId,
    newSetVariableHistory: setVariableHistory,
    newSessionState: {
      ...stateWithBodyEdge,
      loops: [...otherLoops, { blockId: block.id, items, index }],
      typebotsQueue: stateWithBodyEdge.typebotsQueue.map((queue, queueIndex) =>
        queueIndex === 0
          ? {
              ...queue,
              // Comes back to the loop block once the body group is over.
              queuedEdgeIds: [returnEdgeId, ...(queue.queuedEdgeIds ?? [])],
            }
          : queue,
      ),
    },
  };
};

const resolveLoopItems = (
  block: LoopBlock,
  state: SessionState,
): LoopItem[] => {
  const { typebot } = state.typebotsQueue[0];
  if (block.options?.sourceType === "answers") {
    const sourceBlock = findBlock(block.options.sourceBlockId, typebot.groups);
    if (!sourceBlock) return [];
    const variableId =
      "options" in sourceBlock &&
      sourceBlock.options &&
      "variableId" in sourceBlock.options
        ? sourceBlock.options.variableId
        : undefined;
    const variableValue = typebot.variables.find(
      (variable) => variable.id === variableId,
    )?.value;
    const codes = parseLoopItems(block.options, variableValue);
    return codes.map((code) => ({
      code,
      label: findOptionLabel(sourceBlock, code) ?? code,
    }));
  }
  const sourceValue = block.options?.sourceVariableId
    ? typebot.variables.find(
        (variable) => variable.id === block.options?.sourceVariableId,
      )?.value
    : undefined;
  return parseLoopItems(block.options, sourceValue).map((item) => ({
    code: item,
    label: item,
  }));
};

const findOptionLabel = (
  sourceBlock: Block,
  code: string,
): string | undefined => {
  if (sourceBlock.type === InputBlockType.CHOICE)
    return sourceBlock.items.find(
      (item) => (item.value ?? item.content)?.trim() === code,
    )?.content;
  if (sourceBlock.type === InputBlockType.PICTURE_CHOICE)
    return sourceBlock.items.find(
      (item) => (item.value ?? item.title)?.trim() === code,
    )?.title;
  if (sourceBlock.type === InputBlockType.MATRIX)
    return sourceBlock.options?.rows?.find(
      (row, index) => getMatrixCode(row, index) === code,
    )?.label;
};

const buildIterationVariables = (
  block: LoopBlock,
  state: SessionState,
  { item, index }: { item: LoopItem; index: number },
): VariableWithUnknowValue[] => {
  const { variables } = state.typebotsQueue[0].typebot;
  const values: [string | undefined, string][] = [
    [block.options?.currentItemVariableId, item.label],
    [block.options?.currentIndexVariableId, String(index)],
    [block.options?.iterationNumberVariableId, String(index + 1)],
  ];
  return values.flatMap(([variableId, value]) => {
    const variable = variables.find((variable) => variable.id === variableId);
    return variable ? [{ ...variable, value }] : [];
  });
};

const findBlock = (
  blockId: string | undefined,
  groups: SessionState["typebotsQueue"][number]["typebot"]["groups"],
) => {
  if (!blockId) return;
  try {
    return getBlockById(blockId, groups).block;
  } catch {
    return;
  }
};
