/**
 * Loop slot of an answer given inside a loop: the loop item when known (the same
 * brand gets the same column for every respondent), else the iteration number.
 * `columnSuffix` is safe in a table column id (no dots).
 */
export const parseLoopSlot = (answer: {
  loopBlockId?: string | null;
  loopIteration?: number | null;
  loopItem?: string | null;
}) => {
  if (!answer.loopBlockId || answer.loopIteration == null) return;
  const key = answer.loopItem ?? `#${answer.loopIteration + 1}`;
  return {
    loopBlockId: answer.loopBlockId,
    key,
    loopItem: answer.loopItem ?? undefined,
    loopIteration: answer.loopIteration,
    columnSuffix: `__loop_${encodeURIComponent(`${answer.loopBlockId}:${key}`).replace(/\./g, "%2E")}`,
  };
};
