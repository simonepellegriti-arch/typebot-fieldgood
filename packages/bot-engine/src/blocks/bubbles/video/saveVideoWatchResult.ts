import {
  type VideoBubbleBlock,
  videoWatchResultSchema,
} from "@typebot.io/blocks-bubbles/video/schema";
import type { Message } from "@typebot.io/chat-api/schemas";
import type { SessionState } from "@typebot.io/chat-session/schemas";
import type { SetVariableHistoryItem } from "@typebot.io/variables/schemas";
import { saveAnswer } from "../../../queries/saveAnswer";
import { updateVariablesInSession } from "../../../updateVariablesInSession";

/**
 * Saves the viewing data of a tracked video as the answer of the video block
 * (value = watch result object) and stores the watched percentage in the
 * configured variable. Replies without valid viewing data (e.g. from channels
 * that can't play the video) just let the flow continue.
 */
export const saveVideoWatchResult = async ({
  block,
  reply,
  state,
}: {
  block: VideoBubbleBlock;
  reply: Extract<Message, { type: "text" }>;
  state: SessionState;
}): Promise<{
  newSessionState: SessionState;
  setVariableHistory: SetVariableHistoryItem[];
}> => {
  const watchResult =
    reply.structuredReply?.type === "video"
      ? reply.structuredReply.result
      : parseTextWatchResult(reply.text);
  if (!watchResult) return { newSessionState: state, setVariableHistory: [] };

  await saveAnswer({
    answer: {
      blockId: block.id,
      content: `${watchResult.watchedPercentage}% (${watchResult.watchedSeconds}s)${
        watchResult.isCompleted ? " completed" : ""
      }`,
      value: watchResult,
    },
    state,
  });

  const variableId = block.content?.watchTracking?.variableId;
  const variable = variableId
    ? state.typebotsQueue[0].typebot.variables.find(
        (variable) => variable.id === variableId,
      )
    : undefined;
  if (!variable) return { newSessionState: state, setVariableHistory: [] };

  const { updatedState, newSetVariableHistory } = updateVariablesInSession({
    state,
    currentBlockId: block.id,
    newVariables: [
      { ...variable, value: String(watchResult.watchedPercentage) },
    ],
  });
  return {
    newSessionState: updatedState,
    setVariableHistory: newSetVariableHistory,
  };
};

const parseTextWatchResult = (text: string) => {
  try {
    const parsedResult = videoWatchResultSchema.safeParse(JSON.parse(text));
    return parsedResult.success ? parsedResult.data : undefined;
  } catch {
    return;
  }
};
