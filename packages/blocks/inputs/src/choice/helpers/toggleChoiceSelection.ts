import type { ButtonItem } from "../schema";

type SelectableItem = Pick<ButtonItem, "id" | "isExclusive">;

/**
 * Multiple choice selection rules shared by the web client and the tests:
 * - selecting an exclusive option ("None of these", "Don't know") deselects all the others;
 * - selecting a regular option deselects any exclusive option;
 * - two exclusive options are never selected together;
 * - options can't be added beyond `maxSelections` (an exclusive option always can).
 */
export const toggleChoiceSelection = ({
  selectedItemIds,
  itemId,
  items,
  maxSelections,
}: {
  selectedItemIds: string[];
  itemId: string;
  items: SelectableItem[];
  maxSelections?: number;
}): string[] => {
  if (selectedItemIds.includes(itemId))
    return selectedItemIds.filter((selectedId) => selectedId !== itemId);

  const clickedItem = items.find((item) => item.id === itemId);
  if (!clickedItem) return selectedItemIds;
  if (clickedItem.isExclusive) return [itemId];

  const exclusiveItemIds = new Set(
    items.filter((item) => item.isExclusive).map((item) => item.id),
  );
  const regularSelection = selectedItemIds.filter(
    (selectedId) => !exclusiveItemIds.has(selectedId),
  );
  if (maxSelections !== undefined && regularSelection.length >= maxSelections)
    return regularSelection;
  return [...regularSelection, itemId];
};
