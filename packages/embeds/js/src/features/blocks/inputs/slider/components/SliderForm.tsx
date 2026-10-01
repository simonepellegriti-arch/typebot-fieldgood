import { defaultSliderInputOptions } from "@typebot.io/blocks-inputs/slider/constants";
import { getSliderRows } from "@typebot.io/blocks-inputs/slider/helpers/getSliderRows";
import { resolveSliderScale } from "@typebot.io/blocks-inputs/slider/helpers/resolveSliderScale";
import { validateSliderValues } from "@typebot.io/blocks-inputs/slider/helpers/validateSliderValues";
import type {
  SliderInputBlock,
  SliderStatement,
} from "@typebot.io/blocks-inputs/slider/schema";
import { cx } from "@typebot.io/ui/lib/cva";
import { createMemo, createSignal, For, Show } from "solid-js";
import { SendButton } from "../../../../../components/SendButton";
import type { InputSubmitContent } from "../../../../../types";

type Props = {
  block: SliderInputBlock;
  onSubmit: (value: InputSubmitContent) => void;
};

/**
 * One slider per statement (or a single one for the question). With "must be
 * moved", the send button waits until every slider was touched, so nobody
 * answers by leaving the thumb on its start position.
 */
export const SliderForm = (props: Props) => {
  const rows = createMemo(() => getSliderRows(props.block.options));
  const scale = createMemo(() => resolveSliderScale(props.block.options));
  const [values, setValues] = createSignal<Record<string, number>>({});
  const isInteractionRequired = () =>
    props.block.options?.isInteractionRequired ??
    defaultSliderInputOptions.isInteractionRequired;
  const unit = () => props.block.options?.unit ?? "";

  const displayedValue = (rowId: string) =>
    values()[rowId] ?? scale().startValue;

  const valuesToSend = () =>
    Object.fromEntries(rows().map((row) => [row.id, displayedValue(row.id)]));

  const canSubmit = () =>
    (!isInteractionRequired() ||
      rows().every((row) => values()[row.id] !== undefined)) &&
    validateSliderValues({
      values: valuesToSend(),
      options: props.block.options,
    }).status === "valid";

  const handleSubmit = (event: SubmitEvent) => {
    event.preventDefault();
    if (!canSubmit()) return;
    const currentValues = valuesToSend();
    const codes = rows().map(
      (row, index) => row.value?.trim() || String(index + 1),
    );
    const isSingle = rows().length === 1;
    props.onSubmit({
      type: "text",
      value: isSingle
        ? String(currentValues[rows()[0]!.id])
        : JSON.stringify(
            Object.fromEntries(
              rows().map((row, index) => [codes[index], currentValues[row.id]]),
            ),
          ),
      label: rows()
        .map((row) =>
          row.label
            ? `${row.label}: ${currentValues[row.id]}${unit()}`
            : `${currentValues[row.id]}${unit()}`,
        )
        .join("\n"),
      structuredReply: { type: "slider", values: currentValues },
    });
  };

  return (
    <form
      class="flex flex-col items-end gap-4 w-full typebot-slider-input"
      onSubmit={handleSubmit}
    >
      <Show when={props.block.options?.question}>
        <p class="w-full font-semibold">{props.block.options?.question}</p>
      </Show>
      <div class="flex flex-col gap-5 w-full">
        <For each={rows()}>
          {(row) => (
            <SliderRow
              row={row}
              blockId={props.block.id}
              min={scale().min}
              max={scale().max}
              step={scale().step}
              value={displayedValue(row.id)}
              isTouched={values()[row.id] !== undefined}
              isValueVisible={
                props.block.options?.isValueVisible ??
                defaultSliderInputOptions.isValueVisible
              }
              unit={unit()}
              minLabel={props.block.options?.minLabel}
              middleLabel={props.block.options?.middleLabel}
              maxLabel={props.block.options?.maxLabel}
              onChange={(value) =>
                setValues((previous) => ({ ...previous, [row.id]: value }))
              }
            />
          )}
        </For>
      </div>
      <SendButton disableIcon isDisabled={!canSubmit()}>
        {props.block.options?.buttonLabel ??
          defaultSliderInputOptions.buttonLabel}
      </SendButton>
    </form>
  );
};

const SliderRow = (props: {
  row: SliderStatement;
  blockId: string;
  min: number;
  max: number;
  step: number;
  value: number;
  isTouched: boolean;
  isValueVisible: boolean;
  unit: string;
  minLabel?: string;
  middleLabel?: string;
  maxLabel?: string;
  onChange: (value: number) => void;
}) => {
  const inputId = () => `${props.blockId}-${props.row.id}`;
  const hasEndLabels = () =>
    Boolean(props.minLabel || props.middleLabel || props.maxLabel);
  return (
    <div class="flex flex-col gap-1 w-full">
      <div class="flex items-end justify-between gap-2">
        <Show when={props.row.label} fallback={<span />}>
          <label for={inputId()} class="font-medium">
            {props.row.label}
          </label>
        </Show>
        <Show when={props.isValueVisible}>
          <span
            class={cx(
              "tabular-nums text-sm font-semibold typebot-slider-value",
              !props.isTouched && "opacity-50",
            )}
            aria-hidden="true"
          >
            {props.value > 0 && props.min < 0 ? "+" : ""}
            {props.value}
            {props.unit}
          </span>
        </Show>
      </div>
      <input
        id={inputId()}
        type="range"
        class={cx("typebot-slider w-full", !props.isTouched && "untouched")}
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        aria-label={props.row.label ? undefined : "Slider"}
        aria-valuetext={`${props.value}${props.unit}`}
        onInput={(event) => props.onChange(Number(event.currentTarget.value))}
        // A click on the start position must count as an answer too.
        onPointerUp={(event) =>
          props.onChange(Number(event.currentTarget.value))
        }
        onKeyUp={(event) => {
          // Only keys that move the thumb count (not Tab reaching the slider).
          if (sliderKeys.includes(event.key))
            props.onChange(Number(event.currentTarget.value));
        }}
      />
      <Show when={hasEndLabels()}>
        <div class="grid grid-cols-3 gap-2 text-xs opacity-75 typebot-slider-labels">
          <span>{props.minLabel}</span>
          <span class="text-center">{props.middleLabel}</span>
          <span class="text-right">{props.maxLabel}</span>
        </div>
      </Show>
    </div>
  );
};

const sliderKeys = [
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Home",
  "End",
  "PageUp",
  "PageDown",
];
