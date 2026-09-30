import { defaultMatrixInputOptions } from "@typebot.io/blocks-inputs/matrix/constants";
import { resolveMatrixLayout } from "@typebot.io/blocks-inputs/matrix/helpers/resolveMatrixLayout";
import { toggleMatrixSelection } from "@typebot.io/blocks-inputs/matrix/helpers/toggleMatrixSelection";
import { validateMatrixAnswers } from "@typebot.io/blocks-inputs/matrix/helpers/validateMatrixAnswers";
import type {
  MatrixColumn,
  MatrixInputBlock,
  MatrixRow,
} from "@typebot.io/blocks-inputs/matrix/schema";
import { cx } from "@typebot.io/ui/lib/cva";
import {
  createMemo,
  createSignal,
  For,
  Match,
  onCleanup,
  onMount,
  Show,
  Switch,
} from "solid-js";
import { SendButton } from "../../../../../components/SendButton";
import type { InputSubmitContent } from "../../../../../types";
import { Checkbox } from "../../buttons/components/Checkbox";

type Props = {
  block: MatrixInputBlock;
  onSubmit: (value: InputSubmitContent) => void;
};

/**
 * Matrix question. Rows/columns arrive in display order (possibly randomized by the
 * server); answers are sent as column ids by row id, the server derives the codes.
 * Wide containers show a table, narrow ones one card per row (same data).
 */
export const MatrixForm = (props: Props) => {
  let containerRef: HTMLFormElement | undefined;
  const [containerWidth, setContainerWidth] = createSignal(0);
  const [answers, setAnswers] = createSignal<Record<string, string[]>>({});

  const rows = () => props.block.options?.rows ?? [];
  const columns = () => props.block.options?.columns ?? [];
  const answerMode = () =>
    props.block.options?.answerMode ?? defaultMatrixInputOptions.answerMode;
  const requiredMode = () =>
    props.block.options?.requiredMode ?? defaultMatrixInputOptions.requiredMode;

  onMount(() => {
    if (!containerRef) return;
    setContainerWidth(containerRef.getBoundingClientRect().width);
    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setContainerWidth(entry.contentRect.width);
    });
    resizeObserver.observe(containerRef);
    onCleanup(() => resizeObserver.disconnect());
  });

  const layout = createMemo(() =>
    resolveMatrixLayout({
      layout: props.block.options?.layout,
      containerWidth: containerWidth(),
      columnCount: columns().length,
    }),
  );

  const validation = createMemo(() =>
    validateMatrixAnswers({ answers: answers(), options: props.block.options }),
  );

  const isRowRequired = (row: MatrixRow) =>
    requiredMode() === "all" ||
    (requiredMode() === "custom" && Boolean(row.isRequired));

  const isChecked = (rowId: string, columnId: string) =>
    (answers()[rowId] ?? []).includes(columnId);

  const toggleCell = (rowId: string, columnId: string) =>
    setAnswers((currentAnswers) =>
      toggleMatrixSelection({
        answers: currentAnswers,
        rowId,
        columnId,
        answerMode: answerMode(),
      }),
    );

  const handleSubmit = (event: SubmitEvent) => {
    event.preventDefault();
    if (validation().status !== "valid") return;
    const currentAnswers = answers();
    // Builder order is unknown here (display order may be shuffled): the text value
    // is informative only, the server uses the structured reply.
    const codesByRow: Record<string, string[]> = {};
    const labelLines: string[] = [];
    for (const row of rows()) {
      const selectedColumns = columns().filter((column) =>
        (currentAnswers[row.id] ?? []).includes(column.id),
      );
      if (selectedColumns.length === 0) continue;
      codesByRow[row.value ?? row.id] = selectedColumns.map(
        (column) => column.value ?? column.id,
      );
      labelLines.push(
        `${row.label ?? ""}: ${selectedColumns
          .map((column) => column.label ?? column.value ?? "")
          .join(", ")}`,
      );
    }
    props.onSubmit({
      type: "text",
      value: JSON.stringify(codesByRow),
      label: labelLines.join("\n"),
      structuredReply: { type: "matrix", answers: currentAnswers },
    });
  };

  const inputName = (rowId: string) => `${props.block.id}-${rowId}`;

  return (
    <form
      ref={containerRef}
      class="flex flex-col items-end gap-3 w-full typebot-matrix-input"
      data-layout={layout()}
      onSubmit={handleSubmit}
    >
      <Show when={props.block.options?.question}>
        <p class="w-full font-semibold" id={`${props.block.id}-question`}>
          {props.block.options?.question}
        </p>
      </Show>
      <Switch>
        <Match when={layout() === "table"}>
          <div class="w-full overflow-x-auto">
            <table
              class="w-full border-separate border-spacing-y-1"
              aria-labelledby={
                props.block.options?.question
                  ? `${props.block.id}-question`
                  : undefined
              }
            >
              <thead>
                <tr>
                  <td />
                  <For each={columns()}>
                    {(column) => (
                      <th
                        scope="col"
                        class="px-2 pb-1 text-sm font-normal text-center align-bottom"
                      >
                        {column.label}
                      </th>
                    )}
                  </For>
                </tr>
              </thead>
              <tbody>
                <For each={rows()}>
                  {(row) => (
                    <tr class="typebot-selectable" data-rowid={row.id}>
                      <th
                        scope="row"
                        class="px-3 py-2 text-left font-semibold rounded-l-md"
                      >
                        {row.label}
                        <RequiredMark isRequired={isRowRequired(row)} />
                      </th>
                      <For each={columns()}>
                        {(column) => (
                          <td class="px-2 py-2 text-center last:rounded-r-md">
                            <CellInput
                              row={row}
                              column={column}
                              name={inputName(row.id)}
                              type={
                                answerMode() === "single" ? "radio" : "checkbox"
                              }
                              isChecked={isChecked(row.id, column.id)}
                              isLabelVisible={false}
                              onToggle={() => toggleCell(row.id, column.id)}
                            />
                          </td>
                        )}
                      </For>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </Match>
        <Match when={layout() === "cards"}>
          <div class="flex flex-col gap-3 w-full">
            <For each={rows()}>
              {(row) => (
                <fieldset
                  class="flex flex-col gap-2 w-full"
                  data-rowid={row.id}
                >
                  <legend class="font-semibold mb-1">
                    {row.label}
                    <RequiredMark isRequired={isRowRequired(row)} />
                  </legend>
                  <div class="flex flex-wrap gap-2">
                    <For each={columns()}>
                      {(column) => (
                        <CellInput
                          row={row}
                          column={column}
                          name={inputName(row.id)}
                          type={
                            answerMode() === "single" ? "radio" : "checkbox"
                          }
                          isChecked={isChecked(row.id, column.id)}
                          isLabelVisible
                          onToggle={() => toggleCell(row.id, column.id)}
                        />
                      )}
                    </For>
                  </div>
                </fieldset>
              )}
            </For>
          </div>
        </Match>
      </Switch>
      <SendButton disableIcon isDisabled={validation().status !== "valid"}>
        {props.block.options?.buttonLabel ??
          defaultMatrixInputOptions.buttonLabel}
      </SendButton>
    </form>
  );
};

const RequiredMark = (props: { isRequired: boolean }) => (
  <Show when={props.isRequired}>
    <span aria-hidden="true"> *</span>
  </Show>
);

const CellInput = (props: {
  row: MatrixRow;
  column: MatrixColumn;
  name: string;
  type: "radio" | "checkbox";
  isChecked: boolean;
  isLabelVisible: boolean;
  onToggle: () => void;
}) => (
  <label
    class={cx(
      "inline-flex items-center gap-2 cursor-pointer select-none",
      props.isLabelVisible &&
        "py-2 px-4 font-semibold typebot-selectable w-full @xs:w-auto",
      props.isLabelVisible && props.isChecked && "selected",
    )}
    data-columnid={props.column.id}
  >
    <input
      type={props.type}
      name={props.name}
      class="sr-only peer"
      checked={props.isChecked}
      aria-label={
        props.isLabelVisible
          ? undefined
          : `${props.row.label ?? ""}: ${props.column.label ?? ""}`
      }
      on:change={props.onToggle}
      on:click={(event) => {
        // Radios can't be unchecked natively: keep single mode consistent.
        if (props.type === "radio" && props.isChecked) event.preventDefault();
      }}
    />
    <span class="peer-focus-visible:ring-2 rounded-full inline-flex">
      <Switch>
        <Match when={props.type === "checkbox"}>
          <Checkbox isChecked={props.isChecked} class="shrink-0" />
        </Match>
        <Match when={props.type === "radio"}>
          <span
            class={cx(
              "w-4 h-4 rounded-full typebot-checkbox inline-flex items-center justify-center shrink-0",
              props.isChecked && "checked",
            )}
          >
            <Show when={props.isChecked}>
              <span class="w-1.5 h-1.5 rounded-full bg-current" />
            </Show>
          </span>
        </Match>
      </Switch>
    </span>
    <Show when={props.isLabelVisible}>
      <span>{props.column.label}</span>
    </Show>
  </label>
);
