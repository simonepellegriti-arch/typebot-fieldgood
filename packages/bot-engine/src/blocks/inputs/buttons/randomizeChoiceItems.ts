import type { ChoiceInputBlock } from "@typebot.io/blocks-inputs/choice/schema";
import { shuffleArray } from "../../../helpers/shuffleArray";

/**
 * Shuffles the displayed options when randomization is enabled. As usual in
 * questionnaires, "Other, please specify" and exclusive options ("None", "Don't
 * know") stay anchored at the end in their original order. Ids and codes are
 * never changed, so saved answers don't depend on the displayed position.
 */
export const randomizeChoiceItems = (
  block: ChoiceInputBlock,
  random: () => number = Math.random,
): ChoiceInputBlock => {
  if (!block.options?.areItemsRandomized) return block;
  const isAnchored = (item: ChoiceInputBlock["items"][number]) =>
    Boolean(item.isExclusive || item.hasTextInput);
  const shuffledItems = shuffleArray(
    block.items.filter((item) => !isAnchored(item)),
    random,
  );
  const anchoredItems = block.items.filter(isAnchored);
  return { ...block, items: [...shuffledItems, ...anchoredItems] };
};
