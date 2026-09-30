import type { ButtonItem } from "../schema";

/**
 * Keeps only the open answers of selected "Other, please specify" options, trimmed.
 * Texts typed in an option that was deselected afterwards are dropped from the result.
 */
export const pickOtherTexts = ({
  selectedItemIds,
  items,
  otherTexts,
}: {
  selectedItemIds: string[];
  items: Pick<ButtonItem, "id" | "hasTextInput">[];
  otherTexts: Record<string, string | undefined> | undefined;
}): Record<string, string> => {
  const pickedTexts: Record<string, string> = {};
  for (const selectedId of selectedItemIds) {
    const item = items.find((item) => item.id === selectedId);
    const text = otherTexts?.[selectedId]?.trim();
    if (item?.hasTextInput && text) pickedTexts[selectedId] = text;
  }
  return pickedTexts;
};
