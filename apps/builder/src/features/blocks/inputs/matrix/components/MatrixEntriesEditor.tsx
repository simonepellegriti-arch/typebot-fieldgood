import { createId } from "@paralleldrive/cuid2";
import { useTranslate } from "@tolgee/react";
import type { MatrixRow } from "@typebot.io/blocks-inputs/matrix/schema";
import { Button } from "@typebot.io/ui/components/Button";
import { DebouncedTextInput } from "@typebot.io/ui/components/DebouncedTextInput";
import { Field } from "@typebot.io/ui/components/Field";
import { Switch } from "@typebot.io/ui/components/Switch";
import { ArrowDown01Icon } from "@typebot.io/ui/icons/ArrowDown01Icon";
import { ArrowUp01Icon } from "@typebot.io/ui/icons/ArrowUp01Icon";
import { PlusSignIcon } from "@typebot.io/ui/icons/PlusSignIcon";
import { TrashIcon } from "@typebot.io/ui/icons/TrashIcon";
import type { Variable } from "@typebot.io/variables/schemas";
import { VariablesCombobox } from "@/components/inputs/VariablesCombobox";

type Props = {
  /** Rows, or columns (which only use id, label and value). */
  entries: MatrixRow[];
  addLabel: string;
  /** Rows only: per-row "required" switch (custom required mode) and variable. */
  rowExtras?: { isRequiredVisible: boolean };
  onEntriesChange: (entries: MatrixRow[]) => void;
};

/**
 * Ordered list editor for matrix rows / columns: visible label + stable code.
 * New entries get the next numeric code so exports stay D10_1, D10_2...
 */
export const MatrixEntriesEditor = ({
  entries,
  addLabel,
  rowExtras,
  onEntriesChange,
}: Props) => {
  const { t } = useTranslate();

  const updateEntry = (entryId: string, updates: Partial<MatrixRow>) =>
    onEntriesChange(
      entries.map((entry) =>
        entry.id === entryId ? { ...entry, ...updates } : entry,
      ),
    );

  const removeEntry = (entryId: string) =>
    onEntriesChange(entries.filter((entry) => entry.id !== entryId));

  const moveEntry = (entryIndex: number, offset: -1 | 1) => {
    const targetIndex = entryIndex + offset;
    if (targetIndex < 0 || targetIndex >= entries.length) return;
    const reorderedEntries = [...entries];
    const [movedEntry] = reorderedEntries.splice(entryIndex, 1);
    if (!movedEntry) return;
    reorderedEntries.splice(targetIndex, 0, movedEntry);
    onEntriesChange(reorderedEntries);
  };

  const addEntry = (newEntry: MatrixRow) =>
    onEntriesChange([...entries, newEntry]);

  return (
    <div className="flex flex-col gap-2">
      {entries.map((entry, entryIndex) => (
        <div
          key={entry.id}
          className="flex flex-col gap-2 rounded-md border border-gray-6 p-2"
        >
          <div className="flex items-center gap-2">
            <DebouncedTextInput
              className="flex-1"
              aria-label={t("blocks.inputs.matrix.entry.label")}
              placeholder={t("blocks.inputs.matrix.entry.label")}
              defaultValue={entry.label ?? ""}
              onValueChange={(label) => updateEntry(entry.id, { label })}
            />
            <DebouncedTextInput
              className="w-20"
              aria-label={t("blocks.inputs.matrix.entry.code")}
              placeholder={String(entryIndex + 1)}
              defaultValue={entry.value ?? ""}
              onValueChange={(value) =>
                updateEntry(entry.id, { value: value.trim() || undefined })
              }
            />
            <Button
              size="icon"
              variant="ghost"
              aria-label={t("blocks.inputs.matrix.entry.moveUp")}
              disabled={entryIndex === 0}
              onClick={() => moveEntry(entryIndex, -1)}
            >
              <ArrowUp01Icon />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              aria-label={t("blocks.inputs.matrix.entry.moveDown")}
              disabled={entryIndex === entries.length - 1}
              onClick={() => moveEntry(entryIndex, 1)}
            >
              <ArrowDown01Icon />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              aria-label={t("blocks.inputs.matrix.entry.remove")}
              onClick={() => removeEntry(entry.id)}
            >
              <TrashIcon />
            </Button>
          </div>
          {rowExtras && (
            <RowExtras
              row={entry}
              isRequiredVisible={rowExtras.isRequiredVisible}
              onRowChange={(updates) => updateEntry(entry.id, updates)}
            />
          )}
        </div>
      ))}
      <Button
        variant="secondary"
        onClick={() =>
          addEntry({ id: createId(), value: getNextNumericCode(entries) })
        }
      >
        <PlusSignIcon />
        {addLabel}
      </Button>
    </div>
  );
};

const RowExtras = ({
  row,
  isRequiredVisible,
  onRowChange,
}: {
  row: MatrixRow;
  isRequiredVisible: boolean;
  onRowChange: (updates: Partial<MatrixRow>) => void;
}) => {
  const { t } = useTranslate();
  return (
    <div className="flex items-center gap-2">
      {isRequiredVisible && (
        <Field.Root className="flex-row items-center">
          <Switch
            checked={row.isRequired ?? false}
            onCheckedChange={(isRequired) => onRowChange({ isRequired })}
          />
          <Field.Label>{t("blocks.inputs.matrix.row.required")}</Field.Label>
        </Field.Root>
      )}
      <div className="flex-1">
        <VariablesCombobox
          initialVariableId={row.variableId}
          placeholder={t("blocks.inputs.matrix.row.variable")}
          onSelectVariable={(variable?: Variable) =>
            onRowChange({ variableId: variable?.id })
          }
        />
      </div>
    </div>
  );
};

const getNextNumericCode = (entries: MatrixRow[]) => {
  const numericCodes = entries
    .map((entry, index) => Number(entry.value?.trim() || index + 1))
    .filter((code) => Number.isInteger(code));
  return String(numericCodes.length > 0 ? Math.max(...numericCodes) + 1 : 1);
};
