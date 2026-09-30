import type { ButtonItem } from "../schema";

type ValidatedItem = Pick<
  ButtonItem,
  "id" | "isExclusive" | "hasTextInput" | "textInputRequired"
>;

export type ChoiceSelectionValidation =
  | { status: "valid" }
  | {
      status: "invalid";
      reason:
        | "empty"
        | "unknownItem"
        | "exclusiveConflict"
        | "belowMinSelections"
        | "aboveMaxSelections"
        | "missingOtherText";
      itemId?: string;
    };

/**
 * Validates a choice answer (single or multiple). Used by the web client to enable
 * the send button and by the bot engine to reject invalid structured replies.
 * An exclusive option is a complete answer on its own, even when `minSelections` > 1.
 */
export const validateChoiceSelection = ({
  selectedItemIds,
  items,
  isMultipleChoice,
  minSelections,
  maxSelections,
  otherTexts,
}: {
  selectedItemIds: string[];
  items: ValidatedItem[];
  isMultipleChoice: boolean;
  minSelections?: number;
  maxSelections?: number;
  otherTexts?: Record<string, string | undefined>;
}): ChoiceSelectionValidation => {
  if (selectedItemIds.length === 0)
    return { status: "invalid", reason: "empty" };

  const selectedItems: ValidatedItem[] = [];
  for (const selectedId of selectedItemIds) {
    const item = items.find((item) => item.id === selectedId);
    if (!item)
      return { status: "invalid", reason: "unknownItem", itemId: selectedId };
    selectedItems.push(item);
  }

  if (!isMultipleChoice && selectedItems.length > 1)
    return { status: "invalid", reason: "aboveMaxSelections" };

  const hasExclusiveItem = selectedItems.some((item) => item.isExclusive);
  if (hasExclusiveItem && selectedItems.length > 1)
    return { status: "invalid", reason: "exclusiveConflict" };

  if (isMultipleChoice && !hasExclusiveItem) {
    if (minSelections !== undefined && selectedItems.length < minSelections)
      return { status: "invalid", reason: "belowMinSelections" };
    if (maxSelections !== undefined && selectedItems.length > maxSelections)
      return { status: "invalid", reason: "aboveMaxSelections" };
  }

  const itemMissingText = selectedItems.find(
    (item) =>
      item.hasTextInput &&
      item.textInputRequired &&
      !otherTexts?.[item.id]?.trim(),
  );
  if (itemMissingText)
    return {
      status: "invalid",
      reason: "missingOtherText",
      itemId: itemMissingText.id,
    };

  return { status: "valid" };
};
