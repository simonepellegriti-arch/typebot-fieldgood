import {
  defaultChoiceInputOptions,
  defaultChoiceItemResearchOptions,
} from "@typebot.io/blocks-inputs/choice/constants";
import type { ChoiceInputBlock } from "@typebot.io/blocks-inputs/choice/schema";
import { guessDeviceIsMobile } from "@typebot.io/lib/guessDeviceIsMobile";
import { cx } from "@typebot.io/ui/lib/cva";
import { createSignal, For, onMount, Show } from "solid-js";
import { Button } from "../../../../../components/Button";
import { SearchInput } from "../../../../../components/inputs/SearchInput";
import { SendButton } from "../../../../../components/SendButton";
import type { InputSubmitContent } from "../../../../../types";
import { OtherTextInput } from "./MultipleChoicesForm";

type Props = {
  chunkIndex: number;
  defaultItems: ChoiceInputBlock["items"];
  options: ChoiceInputBlock["options"];
  onSubmit: (value: InputSubmitContent) => void;
};

export const Buttons = (props: Props) => {
  let inputRef: HTMLInputElement | undefined;
  const areButtonsVisible =
    props.options?.areInitialSearchButtonsVisible ??
    defaultChoiceInputOptions.areInitialSearchButtonsVisible;
  const [filteredItems, setFilteredItems] = createSignal(
    props.options?.isSearchable && !areButtonsVisible ? [] : props.defaultItems,
  );

  onMount(() => {
    if (!guessDeviceIsMobile() && inputRef)
      inputRef.focus({ preventScroll: true });
  });

  // "Other, please specify" option waiting for its open text.
  const [pendingOtherItemId, setPendingOtherItemId] = createSignal<string>();
  const [otherText, setOtherText] = createSignal("");

  const pendingOtherItem = () =>
    props.defaultItems.find((item) => item.id === pendingOtherItemId());

  const handleClick = (itemIndex: number) => {
    const item = filteredItems()[itemIndex];
    if (!item) return;
    if (item.hasTextInput) {
      if (pendingOtherItemId() !== item.id) setOtherText("");
      setPendingOtherItemId(item.id);
      return;
    }
    setPendingOtherItemId(undefined);
    const { value, content } = item;

    props.onSubmit({
      type: "text",
      value: value || content || "",
      label: value ? content : undefined,
    });
  };

  const isOtherTextMissing = () =>
    Boolean(pendingOtherItem()?.textInputRequired) && otherText().trim() === "";

  const submitOtherItem = () => {
    const item = pendingOtherItem();
    if (!item || isOtherTextMissing()) return;
    const trimmedText = otherText().trim();
    const label = item.content ?? item.value ?? "";
    props.onSubmit({
      type: "text",
      value: item.value || item.content || "",
      label: trimmedText ? `${label}: ${trimmedText}` : label,
      structuredReply: {
        type: "choice",
        itemIds: [item.id],
        otherTexts: trimmedText ? { [item.id]: trimmedText } : undefined,
      },
    });
  };

  const filterItems = (inputValue: string) => {
    if (inputValue === "" || inputValue.trim().length === 0) {
      setFilteredItems(!areButtonsVisible ? [] : props.defaultItems);
      return;
    }

    setFilteredItems(
      props.defaultItems.filter((item) =>
        item.content?.toLowerCase().includes(inputValue.toLowerCase()),
      ),
    );
  };

  return (
    <div class="flex flex-col items-end gap-2 w-full typebot-buttons-input">
      <Show when={props.options?.isSearchable}>
        <div class="flex items-end typebot-input w-full">
          <SearchInput
            ref={inputRef}
            onInput={filterItems}
            placeholder={
              props.options?.searchInputPlaceholder ??
              defaultChoiceInputOptions.searchInputPlaceholder
            }
            onClear={() =>
              setFilteredItems(!areButtonsVisible ? [] : props.defaultItems)
            }
          />
        </div>
      </Show>

      <div
        class={cx(
          "flex justify-end gap-2 w-full @xs:w-auto",
          props.options?.isSearchable &&
            "overflow-y-scroll max-h-80 rounded-md",
        )}
        data-slot="list"
      >
        <For each={filteredItems()}>
          {(item, index) => (
            <span class="relative">
              <Button
                on:click={() => handleClick(index())}
                data-itemid={item.id}
                aria-expanded={
                  item.hasTextInput
                    ? pendingOtherItemId() === item.id
                    : undefined
                }
                class={cx(
                  "w-full",
                  pendingOtherItemId() === item.id && "brightness-90",
                )}
              >
                {item.content}
              </Button>
              {props.chunkIndex === 0 && props.defaultItems.length === 1 && (
                <span class="flex h-3 w-3 absolute top-0 right-0 -mt-1 -mr-1 ping">
                  <span class="animate-ping absolute inline-flex h-full w-full rounded-full brightness-200 opacity-75" />
                  <span class="relative inline-flex rounded-full h-3 w-3 brightness-150" />
                </span>
              )}
            </span>
          )}
        </For>
      </div>
      <Show when={pendingOtherItem()} keyed>
        {(item) => (
          <form
            class="flex flex-col items-end gap-2 w-full"
            onSubmit={(event) => {
              event.preventDefault();
              submitOtherItem();
            }}
          >
            <OtherTextInput
              itemLabel={item.content ?? ""}
              placeholder={
                item.textInputPlaceholder ??
                defaultChoiceItemResearchOptions.textInputPlaceholder
              }
              isRequired={Boolean(item.textInputRequired)}
              value={otherText()}
              onInput={setOtherText}
              onEnter={submitOtherItem}
            />
            <SendButton disableIcon isDisabled={isOtherTextMissing()}>
              {props.options?.buttonLabel ??
                defaultChoiceInputOptions.buttonLabel}
            </SendButton>
          </form>
        )}
      </Show>
    </div>
  );
};
