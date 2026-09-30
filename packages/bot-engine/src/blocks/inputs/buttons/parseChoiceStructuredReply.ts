import { defaultChoiceMediaOptions } from "@typebot.io/blocks-inputs/choice/constants";
import { pickOtherTexts } from "@typebot.io/blocks-inputs/choice/helpers/pickOtherTexts";
import { validateChoiceSelection } from "@typebot.io/blocks-inputs/choice/helpers/validateChoiceSelection";
import type {
  ChoiceInputBlock,
  ChoiceStructuredReply,
} from "@typebot.io/blocks-inputs/choice/schema";
import { isDefined } from "@typebot.io/lib/utils";
import { parseItemContent } from "../../../helpers/parseItemContent";
import type { ParsedReply } from "../../../types";

/**
 * Parses the structured choice reply of the web client (selected item ids +
 * "Other, please specify" texts). Validates exclusivity, min/max selections and
 * required open texts. Open texts are returned by option code, separately from
 * codes and labels: they are never concatenated to a label.
 */
export const parseChoiceStructuredReply = (
  reply: ChoiceStructuredReply,
  {
    items,
    options,
  }: {
    items: ChoiceInputBlock["items"];
    options: ChoiceInputBlock["options"];
  },
): ParsedReply => {
  const isMultipleChoice = Boolean(options?.isMultipleChoice);
  const validation = validateChoiceSelection({
    selectedItemIds: reply.itemIds,
    items,
    isMultipleChoice,
    minSelections: options?.minSelections,
    maxSelections: options?.maxSelections,
    otherTexts: reply.otherTexts,
  });
  if (validation.status === "invalid") return { status: "fail" };
  if (!areWatchRequirementsMet(reply, { items, options }))
    return { status: "fail" };

  // Builder order, whatever the click order.
  const selectedItems = items.filter((item) => reply.itemIds.includes(item.id));
  const values = selectedItems
    .map((item) => item.value ?? parseItemContent(item)?.trim())
    .filter(isDefined);
  const labels = selectedItems
    .map((item) => parseItemContent(item)?.trim() ?? item.value)
    .filter(isDefined);
  if (values.length !== selectedItems.length) return { status: "fail" };

  const otherTextsByItemId = pickOtherTexts({
    selectedItemIds: reply.itemIds,
    items,
    otherTexts: reply.otherTexts,
  });
  const otherTexts: Record<string, string> = {};
  for (const [itemId, text] of Object.entries(otherTextsByItemId)) {
    const itemIndex = selectedItems.findIndex((item) => item.id === itemId);
    const code = values[itemIndex];
    if (code !== undefined) otherTexts[code] = text;
  }
  const hasOtherTexts = Object.keys(otherTexts).length > 0;
  const mediaWatch = buildMediaWatchDetails(reply, items);
  const details = mediaWatch ? { mediaWatch } : undefined;

  if (!isMultipleChoice) {
    const [selectedItem] = selectedItems;
    const [value] = values;
    if (!selectedItem || value === undefined) return { status: "fail" };
    return {
      status: "success",
      content: value,
      outgoingEdgeId: selectedItem.outgoingEdgeId,
      structuredAnswer: {
        value,
        label: labels[0] ?? value,
        otherTexts: hasOtherTexts ? otherTexts : undefined,
        details,
      },
    };
  }

  return {
    status: "success",
    content: values.join(", "),
    structuredAnswer: {
      value: values,
      label: labels,
      otherTexts: hasOtherTexts ? otherTexts : undefined,
      details,
    },
  };
};

/**
 * "Watch before select": every selected video option must have been watched up to
 * the minimum percentage (or to the end). Viewing data is tracked per clip.
 */
const areWatchRequirementsMet = (
  reply: ChoiceStructuredReply,
  {
    items,
    options,
  }: {
    items: ChoiceInputBlock["items"];
    options: ChoiceInputBlock["options"];
  },
) => {
  if (!options?.requireWatchBeforeSelect) return true;
  const minimumWatchPercentage =
    options.minimumWatchPercentage ??
    defaultChoiceMediaOptions.minimumWatchPercentage;
  return reply.itemIds.every((itemId) => {
    const item = items.find((item) => item.id === itemId);
    if (item?.media?.type !== "video") return true;
    const watch = reply.mediaWatch?.[itemId];
    return (
      watch !== undefined &&
      (watch.isCompleted || watch.watchedPercentage >= minimumWatchPercentage)
    );
  });
};

/** Viewing data of every video option (selected or not), by option code. */
const buildMediaWatchDetails = (
  reply: ChoiceStructuredReply,
  items: ChoiceInputBlock["items"],
) => {
  const entries = items.flatMap((item) => {
    const watch = reply.mediaWatch?.[item.id];
    const code = item.value ?? parseItemContent(item)?.trim();
    if (item.media?.type !== "video" || !watch || code === undefined) return [];
    return [[code, watch] as const];
  });
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
};
