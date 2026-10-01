import { defaultConstantSumInputOptions } from "@typebot.io/blocks-inputs/constantSum/constants";
import { validateConstantSumValues } from "@typebot.io/blocks-inputs/constantSum/helpers/validateConstantSumValues";
import type { ConstantSumInputBlock } from "@typebot.io/blocks-inputs/constantSum/schema";
import { cx } from "@typebot.io/ui/lib/cva";
import { createMemo, createSignal, For, Show } from "solid-js";
import { SendButton } from "../../../../../components/SendButton";
import type { InputSubmitContent } from "../../../../../types";

type Props = {
  block: ConstantSumInputBlock;
  onSubmit: (value: InputSubmitContent) => void;
};

/**
 * "Give 100 points to the categories": one number field per category, a live
 * total and what is left to assign. Sending is possible only at the exact total.
 */
export const ConstantSumForm = (props: Props) => {
  const items = () => props.block.options?.items ?? [];
  const total = () =>
    props.block.options?.total ?? defaultConstantSumInputOptions.total;
  const unit = () => props.block.options?.unit ?? "";
  const [inputs, setInputs] = createSignal<Record<string, string>>({});

  const values = createMemo(() =>
    Object.fromEntries(
      items().flatMap((item) => {
        const rawValue = inputs()[item.id]?.trim();
        if (!rawValue) return [];
        return [[item.id, Number(rawValue)]];
      }),
    ),
  );
  const sum = createMemo(() =>
    Object.values(values()).reduce(
      (currentSum, amount) =>
        Number.isFinite(amount) ? currentSum + amount : currentSum,
      0,
    ),
  );
  const validation = createMemo(() =>
    validateConstantSumValues({
      values: values(),
      options: props.block.options,
    }),
  );
  const remaining = () => total() - sum();

  const updateAmount = (itemId: string, rawValue: string) =>
    setInputs((previous) => ({
      ...previous,
      [itemId]: rawValue.replace(/[^\d]/g, ""),
    }));

  const handleSubmit = (event: SubmitEvent) => {
    event.preventDefault();
    if (validation().status !== "valid") return;
    const amountsById = Object.fromEntries(
      items().map((item) => [item.id, values()[item.id] ?? 0]),
    );
    props.onSubmit({
      type: "text",
      value: JSON.stringify(
        Object.fromEntries(
          items().map((item, index) => [
            item.value?.trim() || String(index + 1),
            amountsById[item.id],
          ]),
        ),
      ),
      label: [
        ...items().map(
          (item) => `${item.label ?? ""}: ${amountsById[item.id]}${unit()}`,
        ),
        `${props.block.options?.totalLabel ?? defaultConstantSumInputOptions.totalLabel}: ${sum()}${unit()}`,
      ].join("\n"),
      structuredReply: { type: "constantSum", values: amountsById },
    });
  };

  return (
    <form
      class="flex flex-col items-end gap-3 w-full typebot-constant-sum-input"
      onSubmit={handleSubmit}
    >
      <Show when={props.block.options?.question}>
        <p class="w-full font-semibold">{props.block.options?.question}</p>
      </Show>
      <div class="flex flex-col gap-2 w-full">
        <For each={items()}>
          {(item) => (
            <label class="flex items-center justify-between gap-3 w-full">
              <span class="flex-1">{item.label}</span>
              <span class="flex items-center gap-1 typebot-input px-2 py-1 shrink-0">
                <input
                  type="text"
                  inputmode="numeric"
                  pattern="[0-9]*"
                  class="w-16 text-right bg-transparent focus:outline-none tabular-nums"
                  placeholder="0"
                  value={inputs()[item.id] ?? ""}
                  aria-label={item.label}
                  onInput={(event) =>
                    updateAmount(item.id, event.currentTarget.value)
                  }
                />
                <Show when={unit()}>
                  <span class="text-sm opacity-75">{unit()}</span>
                </Show>
              </span>
            </label>
          )}
        </For>
      </div>
      <div
        class={cx(
          "flex items-center justify-between w-full gap-2 pt-2 font-semibold typebot-constant-sum-total",
          remaining() !== 0 && "opacity-90",
        )}
        style={{ "border-top": "1px solid currentColor" }}
        aria-live="polite"
      >
        <span>
          {props.block.options?.totalLabel ??
            defaultConstantSumInputOptions.totalLabel}
        </span>
        <span class="tabular-nums">
          {sum()}
          {unit()} / {total()}
          {unit()}
          <Show when={remaining() !== 0}>
            <span class="font-normal text-sm">
              {" "}
              ({remaining() > 0 ? `−${remaining()}` : `+${-remaining()}`})
            </span>
          </Show>
        </span>
      </div>
      <SendButton disableIcon isDisabled={validation().status !== "valid"}>
        {props.block.options?.buttonLabel ??
          defaultConstantSumInputOptions.buttonLabel}
      </SendButton>
    </form>
  );
};
