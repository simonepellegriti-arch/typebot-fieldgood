import {
  defaultChoiceInputOptions,
  defaultChoiceItemResearchOptions,
} from "@typebot.io/blocks-inputs/choice/constants";
import { pickOtherTexts } from "@typebot.io/blocks-inputs/choice/helpers/pickOtherTexts";
import { toggleChoiceSelection } from "@typebot.io/blocks-inputs/choice/helpers/toggleChoiceSelection";
import { validateChoiceSelection } from "@typebot.io/blocks-inputs/choice/helpers/validateChoiceSelection";
import type { ChoiceInputBlock } from "@typebot.io/blocks-inputs/choice/schema";
import { guessDeviceIsMobile } from "@typebot.io/lib/guessDeviceIsMobile";
import { createMemo, createSignal, For, onMount, Show } from "solid-js";
import { SearchInput } from "../../../../../components/inputs/SearchInput";
import { SendButton } from "../../../../../components/SendButton";
import type { InputSubmitContent } from "../../../../../types";
import { Checkbox } from "./Checkbox";

type Props = {
  defaultItems: ChoiceInputBlock["items"];
  options: ChoiceInputBlock["options"];
  onSubmit: (value: InputSubmitContent) => void;
};

export const MultipleChoicesForm = (props: Props) => {
  let inputRef: HTMLInputElement | undefined;
  const [filteredItems, setFilteredItems] = createSignal(
    props.options?.isSearchable &&
      !props.options?.areInitialSearchButtonsVisible
      ? []
      : props.defaultItems,
  );
  const [selectedItemIds, setSelectedItemIds] = createSignal<string[]>([]);
  // "Other, please specify" texts by item id. Texts of deselected options are
  // kept while the form is open (re-selecting restores them) but never submitted.
  const [otherTexts, setOtherTexts] = createSignal<Record<string, string>>({});

  onMount(() => {
    if (!guessDeviceIsMobile() && inputRef)
      inputRef.focus({ preventScroll: true });
  });

  const selectionValidation = createMemo(() =>
    validateChoiceSelection({
      selectedItemIds: selectedItemIds(),
      items: props.defaultItems,
      isMultipleChoice: true,
      minSelections: props.options?.minSelections,
      maxSelections: props.options?.maxSelections,
      otherTexts: otherTexts(),
    }),
  );

  const handleClick = (itemId: string) => {
    setSelectedItemIds((currentSelection) =>
      toggleChoiceSelection({
        selectedItemIds: currentSelection,
        itemId,
        items: props.defaultItems,
        maxSelections: props.options?.maxSelections,
      }),
    );
  };

  const isSelected = (itemId: string) => selectedItemIds().includes(itemId);

  const handleSubmit = (event?: SubmitEvent) => {
    event?.preventDefault();
    if (selectionValidation().status !== "valid") return;
    // Builder order, whatever the click order.
    const selectedItems = props.defaultItems.filter((item) =>
      selectedItemIds().includes(item.id),
    );
    const hasInternalValue = selectedItems.some((item) => item?.value);
    const submittedOtherTexts = pickOtherTexts({
      selectedItemIds: selectedItemIds(),
      items: props.defaultItems,
      otherTexts: otherTexts(),
    });
    const hasOtherTexts = Object.keys(submittedOtherTexts).length > 0;

    props.onSubmit({
      type: "text",
      value: selectedItems
        .map((item) => {
          return item?.value ?? item?.content;
        })
        .join(", "),
      label:
        hasInternalValue || hasOtherTexts
          ? selectedItems
              .map((item) => {
                const label = item?.content ?? item?.value;
                const otherText = submittedOtherTexts[item.id];
                return otherText ? `${label}: ${otherText}` : label;
              })
              .join(", ")
          : undefined,
      structuredReply: hasOtherTexts
        ? {
            type: "choice",
            itemIds: selectedItems.map((item) => item.id),
            otherTexts: submittedOtherTexts,
          }
        : undefined,
    });
  };

  const filterItems = (inputValue: string) => {
    if (inputValue === "" || inputValue.trim().length === 0) {
      setFilteredItems(
        !props.options?.areInitialSearchButtonsVisible
          ? []
          : props.defaultItems,
      );
      return;
    }

    setFilteredItems(
      props.defaultItems.filter((item) =>
        item.content?.toLowerCase().includes(inputValue.toLowerCase()),
      ),
    );
  };

  return (
    <form
      class="flex flex-col items-end gap-2 w-full typebot-buttons-input"
      onSubmit={handleSubmit}
    >
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
              setFilteredItems(
                !props.options?.areInitialSearchButtonsVisible
                  ? []
                  : props.defaultItems,
              )
            }
          />
        </div>
      </Show>
      <div
        class={
          "flex justify-end gap-2" +
          (props.options?.isSearchable
            ? " overflow-y-scroll max-h-80 rounded-md"
            : "")
        }
        data-slot="list"
      >
        <For each={filteredItems()}>
          {(item) => (
            <span class="relative w-full @xs:w-auto flex flex-col gap-2">
              <label
                class={
                  "block w-full py-2 px-4 font-semibold focus:outline-none cursor-pointer select-none typebot-selectable" +
                  (isSelected(item.id) ? " selected" : "")
                }
                data-itemid={item.id}
                data-exclusive={item.isExclusive ? "true" : undefined}
              >
                <input
                  type="checkbox"
                  class="sr-only"
                  checked={isSelected(item.id)}
                  on:change={() => handleClick(item.id)}
                />
                <div class="flex items-center gap-2">
                  <Checkbox isChecked={isSelected(item.id)} class="shrink-0" />
                  <span>{item.content}</span>
                </div>
              </label>
              <Show when={item.hasTextInput && isSelected(item.id)}>
                <OtherTextInput
                  itemLabel={item.content ?? ""}
                  placeholder={
                    item.textInputPlaceholder ??
                    defaultChoiceItemResearchOptions.textInputPlaceholder
                  }
                  isRequired={Boolean(item.textInputRequired)}
                  value={otherTexts()[item.id] ?? ""}
                  onInput={(text) =>
                    setOtherTexts((currentTexts) => ({
                      ...currentTexts,
                      [item.id]: text,
                    }))
                  }
                />
              </Show>
            </span>
          )}
        </For>
        <For
          each={selectedItemIds().filter((selectedItemId) =>
            filteredItems().every((item) => item.id !== selectedItemId),
          )}
        >
          {(selectedItemId) => (
            <span class="relative w-full @xs:w-auto">
              <label
                class={
                  "block w-full py-2 px-4 font-semibold focus:outline-none cursor-pointer select-none typebot-selectable selected"
                }
                data-itemid={selectedItemId}
              >
                <input
                  type="checkbox"
                  class="sr-only"
                  checked
                  on:change={() => handleClick(selectedItemId)}
                />
                <div class="flex items-center gap-2">
                  <Checkbox isChecked />
                  <span>
                    {
                      props.defaultItems.find(
                        (item) => item.id === selectedItemId,
                      )?.content
                    }
                  </span>
                </div>
              </label>
            </span>
          )}
        </For>
      </div>
      {selectedItemIds().length > 0 && (
        <SendButton
          disableIcon
          isDisabled={selectionValidation().status !== "valid"}
        >
          {props.options?.buttonLabel ?? defaultChoiceInputOptions.buttonLabel}
        </SendButton>
      )}
    </form>
  );
};

/** Open text field of an "Other, please specify" option, focused when it appears. */
export const OtherTextInput = (props: {
  itemLabel: string;
  placeholder: string;
  isRequired: boolean;
  value: string;
  onInput: (text: string) => void;
  onEnter?: () => void;
}) => {
  let otherInputRef: HTMLInputElement | undefined;
  onMount(() => otherInputRef?.focus({ preventScroll: true }));
  return (
    <div class="flex typebot-input w-full">
      <input
        ref={otherInputRef}
        type="text"
        class="focus:outline-none bg-transparent px-4 py-2 flex-1 w-full text-input"
        aria-label={`${props.itemLabel} – ${props.placeholder}`}
        aria-required={props.isRequired}
        aria-invalid={props.isRequired && props.value.trim() === ""}
        placeholder={props.placeholder}
        value={props.value}
        maxLength={5000}
        onInput={(event) => props.onInput(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && props.onEnter) {
            event.preventDefault();
            props.onEnter();
          }
        }}
      />
    </div>
  );
};
