import { useTranslate } from "@tolgee/react";
import { defaultMatrixInputOptions } from "@typebot.io/blocks-inputs/matrix/constants";
import type {
  MatrixInputBlock,
  MatrixInputOptions,
  MatrixRow,
} from "@typebot.io/blocks-inputs/matrix/schema";
import { Field } from "@typebot.io/ui/components/Field";
import { MoreInfoTooltip } from "@typebot.io/ui/components/MoreInfoTooltip";
import { Switch } from "@typebot.io/ui/components/Switch";
import type { Variable } from "@typebot.io/variables/schemas";
import { BasicNumberInput } from "@/components/inputs/BasicNumberInput";
import { BasicSelect } from "@/components/inputs/BasicSelect";
import { DebouncedTextareaWithVariablesButton } from "@/components/inputs/DebouncedTextarea";
import { DebouncedTextInputWithVariablesButton } from "@/components/inputs/DebouncedTextInput";
import { VariablesCombobox } from "@/components/inputs/VariablesCombobox";
import { MatrixEntriesEditor } from "./MatrixEntriesEditor";

type Props = {
  options: MatrixInputBlock["options"];
  onOptionsChange: (options: MatrixInputBlock["options"]) => void;
};

export const MatrixInputSettings = ({ options, onOptionsChange }: Props) => {
  const { t } = useTranslate();
  const updateOptions = (updates: Partial<MatrixInputOptions>) =>
    onOptionsChange({ ...options, ...updates });

  const requiredMode =
    options?.requiredMode ?? defaultMatrixInputOptions.requiredMode;
  const answerMode =
    options?.answerMode ?? defaultMatrixInputOptions.answerMode;

  return (
    <div className="flex flex-col gap-4">
      <Field.Root>
        <Field.Label>{t("blocks.inputs.matrix.settings.question")}</Field.Label>
        <DebouncedTextareaWithVariablesButton
          defaultValue={options?.question ?? ""}
          onValueChange={(question) => updateOptions({ question })}
        />
      </Field.Root>

      <Field.Root>
        <Field.Label>
          {t("blocks.inputs.matrix.settings.rows")}
          <MoreInfoTooltip>
            {t("blocks.inputs.matrix.settings.codes.helperText")}
          </MoreInfoTooltip>
        </Field.Label>
        <MatrixEntriesEditor
          entries={options?.rows ?? []}
          addLabel={t("blocks.inputs.matrix.settings.addRow")}
          rowExtras={{ isRequiredVisible: requiredMode === "custom" }}
          onEntriesChange={(rows) => updateOptions({ rows })}
        />
      </Field.Root>

      <Field.Root>
        <Field.Label>{t("blocks.inputs.matrix.settings.columns")}</Field.Label>
        <MatrixEntriesEditor
          entries={options?.columns ?? []}
          addLabel={t("blocks.inputs.matrix.settings.addColumn")}
          onEntriesChange={(columns) =>
            updateOptions({ columns: columns.map(toColumn) })
          }
        />
      </Field.Root>

      <Field.Root>
        <Field.Label>
          {t("blocks.inputs.matrix.settings.answerMode")}
        </Field.Label>
        <BasicSelect
          value={answerMode}
          items={[
            {
              label: t("blocks.inputs.matrix.settings.answerMode.single"),
              value: "single" as const,
            },
            {
              label: t("blocks.inputs.matrix.settings.answerMode.multiple"),
              value: "multiple" as const,
            },
          ]}
          onChange={(answerMode) => updateOptions({ answerMode })}
        />
      </Field.Root>

      <Field.Root>
        <Field.Label>{t("blocks.inputs.matrix.settings.required")}</Field.Label>
        <BasicSelect
          value={requiredMode}
          items={[
            {
              label: t("blocks.inputs.matrix.settings.required.all"),
              value: "all" as const,
            },
            {
              label: t("blocks.inputs.matrix.settings.required.none"),
              value: "none" as const,
            },
            {
              label: t("blocks.inputs.matrix.settings.required.custom"),
              value: "custom" as const,
            },
          ]}
          onChange={(requiredMode) => updateOptions({ requiredMode })}
        />
      </Field.Root>

      <div className="flex gap-2">
        <Field.Root className="flex-1">
          <Field.Label>
            {t("blocks.inputs.matrix.settings.minAnsweredRows")}
          </Field.Label>
          <BasicNumberInput
            withVariableButton={false}
            min={0}
            defaultValue={options?.minAnsweredRows}
            onValueChange={(minAnsweredRows) =>
              updateOptions({ minAnsweredRows })
            }
          />
        </Field.Root>
        <Field.Root className="flex-1">
          <Field.Label>
            {t("blocks.inputs.matrix.settings.maxAnsweredRows")}
          </Field.Label>
          <BasicNumberInput
            withVariableButton={false}
            min={1}
            defaultValue={options?.maxAnsweredRows}
            onValueChange={(maxAnsweredRows) =>
              updateOptions({ maxAnsweredRows })
            }
          />
        </Field.Root>
      </div>

      <Field.Root className="flex-row items-center">
        <Switch
          checked={
            options?.areRowsRandomized ??
            defaultMatrixInputOptions.areRowsRandomized
          }
          onCheckedChange={(areRowsRandomized) =>
            updateOptions({ areRowsRandomized })
          }
        />
        <Field.Label>
          {t("blocks.inputs.matrix.settings.randomizeRows")}
          <MoreInfoTooltip>
            {t("blocks.inputs.matrix.settings.randomize.helperText")}
          </MoreInfoTooltip>
        </Field.Label>
      </Field.Root>
      <Field.Root className="flex-row items-center">
        <Switch
          checked={
            options?.areColumnsRandomized ??
            defaultMatrixInputOptions.areColumnsRandomized
          }
          onCheckedChange={(areColumnsRandomized) =>
            updateOptions({ areColumnsRandomized })
          }
        />
        <Field.Label>
          {t("blocks.inputs.matrix.settings.randomizeColumns")}
        </Field.Label>
      </Field.Root>

      <Field.Root>
        <Field.Label>{t("blocks.inputs.matrix.settings.layout")}</Field.Label>
        <BasicSelect
          value={options?.layout ?? defaultMatrixInputOptions.layout}
          items={[
            {
              label: t("blocks.inputs.matrix.settings.layout.auto"),
              value: "auto" as const,
            },
            {
              label: t("blocks.inputs.matrix.settings.layout.table"),
              value: "table" as const,
            },
            {
              label: t("blocks.inputs.matrix.settings.layout.cards"),
              value: "cards" as const,
            },
          ]}
          onChange={(layout) => updateOptions({ layout })}
        />
      </Field.Root>

      <Field.Root>
        <Field.Label>{t("blocks.inputs.settings.button.label")}</Field.Label>
        <DebouncedTextInputWithVariablesButton
          defaultValue={
            options?.buttonLabel ?? defaultMatrixInputOptions.buttonLabel
          }
          onValueChange={(buttonLabel) => updateOptions({ buttonLabel })}
        />
      </Field.Root>

      <Field.Root>
        <Field.Label>
          {t("blocks.inputs.settings.saveAnswer.label")}
          <MoreInfoTooltip>
            {t("blocks.inputs.matrix.settings.variable.helperText")}
          </MoreInfoTooltip>
        </Field.Label>
        <VariablesCombobox
          initialVariableId={options?.variableId}
          onSelectVariable={(variable?: Variable) =>
            updateOptions({ variableId: variable?.id })
          }
        />
      </Field.Root>
    </div>
  );
};

const toColumn = ({ id, label, value }: MatrixRow) => ({ id, label, value });
