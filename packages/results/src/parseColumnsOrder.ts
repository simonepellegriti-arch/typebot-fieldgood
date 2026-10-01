import type { ResultHeaderCell } from "./schemas/results";

export const parseColumnsOrder = (
  existingOrder: string[] | undefined,
  resultHeader: ResultHeaderCell[],
) => {
  const resultHeaderIds = resultHeader.map((header) => header.id);

  if (existingOrder?.at(0) === "select")
    // Old format potentially broken, reset to default
    return ["select", ...resultHeaderIds, "logs"];

  const orderedHeaderIds = existingOrder ?? resultHeaderIds;
  const missingHeaderIds = resultHeaderIds.filter(
    (headerId) => !orderedHeaderIds.includes(headerId),
  );

  // New loop columns (D2__loop_…) go next to their question column, not at the end.
  const orderedIds = [...orderedHeaderIds];
  const appendedIds: string[] = [];
  for (const headerId of missingHeaderIds) {
    const loopSeparatorIndex = headerId.indexOf(loopColumnSeparator);
    const questionId =
      loopSeparatorIndex > 0
        ? headerId.slice(0, loopSeparatorIndex)
        : undefined;
    const lastSiblingIndex = questionId
      ? orderedIds.findLastIndex(
          (id) =>
            id === questionId ||
            id.startsWith(`${questionId}${loopColumnSeparator}`),
        )
      : -1;
    if (lastSiblingIndex === -1) appendedIds.push(headerId);
    else orderedIds.splice(lastSiblingIndex + 1, 0, headerId);
  }

  return ["select", ...orderedIds, ...appendedIds, "logs"];
};

const loopColumnSeparator = "__loop_";
