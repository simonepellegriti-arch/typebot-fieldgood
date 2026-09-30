import type { SessionState } from "@typebot.io/chat-session/schemas";

/**
 * Loop context of an answer given now: innermost active loop, 0-based iteration
 * and item code. Answers given inside a loop keep it, so iterations never
 * overwrite each other.
 */
export const getAnswerLoopContext = (state: SessionState) => {
  const currentLoop = state.loops?.at(-1);
  const currentLoopItem = currentLoop?.items[currentLoop.index];
  if (!currentLoop || !currentLoopItem) return {};
  return {
    loopBlockId: currentLoop.blockId,
    loopIteration: currentLoop.index,
    loopItem: currentLoopItem.code,
  };
};
