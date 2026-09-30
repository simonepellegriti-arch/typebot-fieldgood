import {
  defaultChoiceInputOptions,
  defaultChoiceItemMediaOptions,
  defaultChoiceItemResearchOptions,
  defaultChoiceMediaOptions,
} from "@typebot.io/blocks-inputs/choice/constants";
import { pickOtherTexts } from "@typebot.io/blocks-inputs/choice/helpers/pickOtherTexts";
import { toggleChoiceSelection } from "@typebot.io/blocks-inputs/choice/helpers/toggleChoiceSelection";
import { validateChoiceSelection } from "@typebot.io/blocks-inputs/choice/helpers/validateChoiceSelection";
import type { ChoiceInputBlock } from "@typebot.io/blocks-inputs/choice/schema";
import { cx } from "@typebot.io/ui/lib/cva";
import { createMemo, createSignal, For, Show } from "solid-js";
import { RobustVideoPlayer } from "../../../../../components/media/RobustVideoPlayer";
import { SendButton } from "../../../../../components/SendButton";
import type { InputSubmitContent } from "../../../../../types";
import { createVideoWatchTracker } from "../../../bubbles/video/helpers/createVideoWatchTracker";
import { Checkbox } from "./Checkbox";
import { OtherTextInput } from "./MultipleChoicesForm";

type Props = {
  block: ChoiceInputBlock;
  onSubmit: (value: InputSubmitContent) => void;
};

/**
 * Choice question whose options are images or video clips (single or multiple).
 * Playing a clip never selects it: selection is a separate control. With
 * "watch before select" an option can only be chosen once enough of its clip was
 * watched; viewing is tracked separately for each clip and sent with the answer.
 */
export const MediaChoiceForm = (props: Props) => {
  const isMultipleChoice = () => Boolean(props.block.options?.isMultipleChoice);
  const minimumWatchPercentage = () =>
    props.block.options?.minimumWatchPercentage ??
    defaultChoiceMediaOptions.minimumWatchPercentage;
  const [selectedItemIds, setSelectedItemIds] = createSignal<string[]>([]);
  const [otherTexts, setOtherTexts] = createSignal<Record<string, string>>({});

  // One tracker per video option: each clip keeps its own viewing data.
  const trackers = new Map(
    props.block.items
      .filter((item) => item.media?.type === "video")
      .map((item) => [
        item.id,
        createVideoWatchTracker({
          tracking: () => ({
            isEnabled: true,
            isRequired: Boolean(props.block.options?.requireWatchBeforeSelect),
            minimumWatchPercentage: minimumWatchPercentage(),
            allowSeeking: true,
          }),
        }),
      ]),
  );

  const canSelect = (itemId: string) => {
    if (!props.block.options?.requireWatchBeforeSelect) return true;
    const tracker = trackers.get(itemId);
    return !tracker || tracker.isRequirementMet();
  };

  const selectItem = (itemId: string) => {
    if (!canSelect(itemId)) return;
    if (!isMultipleChoice()) {
      setSelectedItemIds((current) => (current[0] === itemId ? [] : [itemId]));
      return;
    }
    setSelectedItemIds((current) =>
      toggleChoiceSelection({
        selectedItemIds: current,
        itemId,
        items: props.block.items,
        maxSelections: props.block.options?.maxSelections,
      }),
    );
  };

  const validation = createMemo(() =>
    validateChoiceSelection({
      selectedItemIds: selectedItemIds(),
      items: props.block.items,
      isMultipleChoice: isMultipleChoice(),
      minSelections: props.block.options?.minSelections,
      maxSelections: props.block.options?.maxSelections,
      otherTexts: otherTexts(),
    }),
  );

  const handleSubmit = (event: SubmitEvent) => {
    event.preventDefault();
    if (validation().status !== "valid") return;
    const selectedItems = props.block.items.filter((item) =>
      selectedItemIds().includes(item.id),
    );
    const submittedOtherTexts = pickOtherTexts({
      selectedItemIds: selectedItemIds(),
      items: props.block.items,
      otherTexts: otherTexts(),
    });
    const mediaWatch = Object.fromEntries(
      [...trackers.entries()].map(([itemId, tracker]) => {
        const result = tracker.getResult();
        return [
          itemId,
          {
            watchedPercentage: result.watchedPercentage,
            watchedSeconds: result.watchedSeconds,
            isCompleted: result.isCompleted,
          },
        ];
      }),
    );
    props.onSubmit({
      type: "text",
      value: selectedItems
        .map((item) => item.value ?? item.content ?? "")
        .join(", "),
      label: selectedItems
        .map((item) => {
          const label = item.content ?? item.value ?? "";
          const otherText = submittedOtherTexts[item.id];
          return otherText ? `${label}: ${otherText}` : label;
        })
        .join(", "),
      structuredReply: {
        type: "choice",
        itemIds: selectedItems.map((item) => item.id),
        otherTexts:
          Object.keys(submittedOtherTexts).length > 0
            ? submittedOtherTexts
            : undefined,
        mediaWatch: trackers.size > 0 ? mediaWatch : undefined,
      },
    });
  };

  return (
    <form
      class="flex flex-col items-end gap-3 w-full typebot-media-choice-input"
      onSubmit={handleSubmit}
    >
      <div
        class="grid grid-cols-1 @sm:grid-cols-2 gap-3 w-full"
        role={isMultipleChoice() ? "group" : "radiogroup"}
      >
        <For each={props.block.items}>
          {(item) => {
            const tracker = trackers.get(item.id);
            const isSelected = () => selectedItemIds().includes(item.id);
            return (
              <div
                class={cx(
                  "flex flex-col gap-2 p-2 typebot-selectable rounded-md",
                  isSelected() && "selected",
                )}
                data-itemid={item.id}
              >
                <Show when={item.media?.type === "image" && item.media.url}>
                  {(url) => (
                    <img
                      src={url()}
                      alt={item.content ?? ""}
                      class="w-full h-auto rounded-md"
                      loading="lazy"
                    />
                  )}
                </Show>
                <Show when={item.media?.type === "video" && item.media.url}>
                  {(url) => (
                    <RobustVideoPlayer
                      src={url()}
                      fallbackSrc={item.media?.fallbackUrl}
                      poster={item.media?.posterUrl}
                      isMuted={
                        item.media?.isMuted ??
                        defaultChoiceItemMediaOptions.isMuted
                      }
                      areControlsDisplayed={
                        item.media?.areControlsDisplayed ??
                        defaultChoiceItemMediaOptions.areControlsDisplayed
                      }
                      onPlay={(video) => tracker?.handlePlay(video)}
                      onPause={(video) => tracker?.handlePause(video)}
                      onTimeUpdate={(video) => tracker?.handleTimeUpdate(video)}
                      onSeeking={(video) => tracker?.handleSeeking(video)}
                      onSeeked={(video) => tracker?.handleTimeUpdate(video)}
                      onEnded={(video) => tracker?.handleEnded(video)}
                      onLoadedMetadata={(video) =>
                        tracker?.handleTimeUpdate(video)
                      }
                    />
                  )}
                </Show>
                <label
                  class={cx(
                    "flex items-center gap-2 font-semibold select-none px-2 py-1",
                    canSelect(item.id)
                      ? "cursor-pointer"
                      : "opacity-60 cursor-not-allowed",
                  )}
                >
                  <input
                    type={isMultipleChoice() ? "checkbox" : "radio"}
                    name={`${props.block.id}-choice`}
                    class="sr-only"
                    checked={isSelected()}
                    disabled={!canSelect(item.id)}
                    on:change={() => selectItem(item.id)}
                  />
                  <Checkbox isChecked={isSelected()} class="shrink-0" />
                  <span>{item.content}</span>
                </label>
                <Show when={tracker && !canSelect(item.id)}>
                  <div
                    class="h-1 w-full rounded-full bg-black/10 overflow-hidden"
                    role="progressbar"
                    aria-label={item.content ?? ""}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(
                      tracker?.progress().watchedPercentage ?? 0,
                    )}
                  >
                    <div
                      class="h-full typebot-checkbox checked"
                      style={{
                        width: `${Math.min(
                          100,
                          ((tracker?.progress().watchedPercentage ?? 0) /
                            Math.max(1, minimumWatchPercentage())) *
                            100,
                        )}%`,
                      }}
                    />
                  </div>
                </Show>
                <Show when={item.hasTextInput && isSelected()}>
                  <OtherTextInput
                    itemLabel={item.content ?? ""}
                    placeholder={
                      item.textInputPlaceholder ??
                      defaultChoiceItemResearchOptions.textInputPlaceholder
                    }
                    isRequired={Boolean(item.textInputRequired)}
                    value={otherTexts()[item.id] ?? ""}
                    onInput={(text) =>
                      setOtherTexts((current) => ({
                        ...current,
                        [item.id]: text,
                      }))
                    }
                  />
                </Show>
              </div>
            );
          }}
        </For>
      </div>
      <SendButton disableIcon isDisabled={validation().status !== "valid"}>
        {props.block.options?.buttonLabel ??
          defaultChoiceInputOptions.buttonLabel}
      </SendButton>
    </form>
  );
};
