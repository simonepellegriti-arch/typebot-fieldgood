import type { Block } from "@typebot.io/blocks-core/schemas/schema";
import { InputBlockType } from "@typebot.io/blocks-inputs/constants";
import { getMatrixCode } from "@typebot.io/blocks-inputs/matrix/helpers/getMatrixCode";
import { LogicBlockType } from "@typebot.io/blocks-logic/constants";
import type { Group } from "@typebot.io/groups/schemas";
import { parseLoopSlot } from "./parseLoopSlot";
import type { Answer } from "./schemas/answers";
import type { ResultHeaderCell } from "./schemas/results";

/**
 * Questions answered inside a loop get one column per loop item ("D2 · Nike",
 * "D2 · #2"), like the SPSS export, instead of one column showing the last answer.
 * The question column is kept only when some answers were given outside a loop.
 */
export const expandLoopResultHeaders = ({
  headers,
  answers,
  groups,
}: {
  headers: ResultHeaderCell[];
  answers: Pick<
    Answer,
    "blockId" | "loopBlockId" | "loopIteration" | "loopItem"
  >[];
  groups: Group[];
}): ResultHeaderCell[] => {
  if (!answers.some((answer) => answer.loopBlockId)) return headers;
  const loopsById = parseLoopsById(groups);
  return headers.flatMap((header) => {
    if (!header.blocks) return [header];
    const blockIds = new Set(header.blocks.map((block) => block.id));
    const headerAnswers = answers.filter((answer) =>
      blockIds.has(answer.blockId),
    );
    const slots = new Map<
      string,
      NonNullable<ReturnType<typeof parseLoopSlot>>
    >();
    for (const answer of headerAnswers) {
      const slot = parseLoopSlot(answer);
      if (!slot) continue;
      const existingSlot = slots.get(slot.columnSuffix);
      if (!existingSlot || slot.loopIteration < existingSlot.loopIteration)
        slots.set(slot.columnSuffix, slot);
    }
    if (slots.size === 0) return [header];
    const slotHeaders = [...slots.values()]
      .sort(
        (a, b) =>
          a.loopIteration - b.loopIteration ||
          a.key.localeCompare(b.key, undefined, { numeric: true }),
      )
      .map(
        (slot): ResultHeaderCell => ({
          id: `${header.id}${slot.columnSuffix}`,
          label: `${header.label} · ${getSlotLabel(slot, loopsById.get(slot.loopBlockId))}`,
          blocks: header.blocks,
          blockType: header.blockType,
          loopSlot: { loopBlockId: slot.loopBlockId, key: slot.key },
        }),
      );
    const hasAnswersOutsideLoops = headerAnswers.some(
      (answer) => !answer.loopBlockId,
    );
    return hasAnswersOutsideLoops ? [header, ...slotHeaders] : slotHeaders;
  });
};

type LoopInfo = { isCount: boolean; itemLabels: Record<string, string> };

const getSlotLabel = (
  slot: NonNullable<ReturnType<typeof parseLoopSlot>>,
  loop: LoopInfo | undefined,
) => {
  if (slot.loopItem === undefined) return slot.key;
  if (loop?.isCount) return `#${slot.loopItem}`;
  return loop?.itemLabels[slot.loopItem] ?? slot.loopItem;
};

/** Count loops and, for loops on a question's answers, the labels of its options. */
const parseLoopsById = (groups: Group[]) => {
  const blocks = groups.flatMap((group): Block[] => group.blocks);
  const loopsById = new Map<string, LoopInfo>();
  for (const block of blocks) {
    if (block.type !== LogicBlockType.LOOP) continue;
    const sourceBlock =
      block.options?.sourceType === "answers"
        ? blocks.find(
            (candidate) => candidate.id === block.options?.sourceBlockId,
          )
        : undefined;
    const itemLabels: Record<string, string> = {};
    // Same codes as the loop items saved by the bot engine.
    if (sourceBlock?.type === InputBlockType.CHOICE)
      for (const item of sourceBlock.items) {
        const code = (item.value ?? item.content)?.trim();
        if (code && item.content) itemLabels[code] = item.content;
      }
    if (sourceBlock?.type === InputBlockType.PICTURE_CHOICE)
      for (const item of sourceBlock.items) {
        const code = (item.value ?? item.title)?.trim();
        if (code && item.title) itemLabels[code] = item.title;
      }
    if (sourceBlock?.type === InputBlockType.MATRIX)
      for (const [index, row] of (sourceBlock.options?.rows ?? []).entries())
        if (row.label) itemLabels[getMatrixCode(row, index)] = row.label;
    loopsById.set(block.id, {
      isCount: block.options?.sourceType === "count",
      itemLabels,
    });
  }
  return loopsById;
};
