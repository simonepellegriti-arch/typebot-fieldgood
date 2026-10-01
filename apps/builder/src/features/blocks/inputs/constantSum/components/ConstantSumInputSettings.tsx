import { useTranslate } from "@tolgee/react";
import { defaultConstantSumInputOptions } from "@typebot.io/blocks-inputs/constantSum/constants";
import type {
  ConstantSumInputBlock,
  ConstantSumInputOptions,
} from "@typebot.io/blocks-inputs/constantSum/schema";
import { Field } from "@typebot.io/ui/components/Field";
import { MoreInfoTooltip } from "@typebot.io/ui/components/MoreInfoTooltip";
import { Switch } from "@typebot.io/ui/components/Switch";
import type { Variable } from "@typebot.io/variables/schemas";
import { BasicNumberInput } from "@/components/inputs/BasicNumberInput";
import { DebouncedTextareaWithVariablesButton } from "@/components/inputs/DebouncedTextarea";
import { DebouncedTextInputWithVariablesButton } from "@/components/inputs/DebouncedTextInput";
import { VariablesCombobox } from "@/components/inputs/VariablesCombobox";
import { MatrixEntriesEditor } from "../../matrix/components/MatrixEntriesEditor";

type Props = {
  options: ConstantSumInputBlock["options"];
  onOptionsChange: (options: ConstantSumInputBlock["options"]) => void;
};

export const ConstantSumInputSettings = ({
  options,
  onOptionsChange,
}: Props) => {
  const { t } = useTranslate();
  const updateOptions = (updates: Partial<ConstantSumInputOptions>) =>
    onOptionsChange({ ...options, ...updates });

  return (
    <div className="flex flex-col gap-4">
      <Field.Root>
        <Field.Label>
          {t("blocks.inputs.constantSum.settings.question")}
        </Field.Label>
        <DebouncedTextareaWithVariablesButton
          defaultValue={options?.question ?? ""}
          onValueChange={(question) => updateOptions({ question })}
        />
      </Field.Root>

      <Field.Root>
        <Field.Label>
          {t("blocks.inputs.constantSum.settings.items")}
          <MoreInfoTooltip>
            {t("blocks.inputs.constantSum.settings.items.helperText")}
          </MoreInfoTooltip>
        </Field.Label>
        <MatrixEntriesEditor
          entries={options?.items ?? []}
          addLabel={t("blocks.inputs.constantSum.settings.addItem")}
          rowExtras={{ isRequiredVisible: false }}
          onEntriesChange={(items) =>
            updateOptions({
              items: items.map(({ id, label, value, variableId }) => ({
                id,
                label,
                value,
                variableId,
              })),
            })
          }
        />
      </Field.Root>

      <div className="flex gap-2">
        <Field.Root className="flex-1">
          <Field.Label>
            {t("blocks.inputs.constantSum.settings.total")}
          </Field.Label>
          <BasicNumberInput
            withVariableButton={false}
            min={1}
            defaultValue={
              options?.total ?? defaultConstantSumInputOptions.total
            }
            onValueChange={(total) =>
              updateOptions({
                total: total && total > 0 ? Math.round(total) : undefined,
              })
            }
          />
        </Field.Root>
        <Field.Root className="flex-1">
          <Field.Label>
            {t("blocks.inputs.constantSum.settings.unit")}
          </Field.Label>
          <DebouncedTextInputWithVariablesButton
            defaultValue={options?.unit ?? ""}
            placeholder="%"
            onValueChange={(unit) => updateOptions({ unit: unit || undefined })}
          />
        </Field.Root>
      </div>

      <Field.Root className="flex-row items-center">
        <Switch
          checked={
            options?.areItemsRandomized ??
            defaultConstantSumInputOptions.areItemsRandomized
          }
          onCheckedChange={(areItemsRandomized) =>
            updateOptions({ areItemsRandomized })
          }
        />
        <Field.Label>
          {t("blocks.inputs.constantSum.settings.randomize")}
        </Field.Label>
      </Field.Root>

      <Field.Root>
        <Field.Label>
          {t("blocks.inputs.constantSum.settings.totalLabel")}
        </Field.Label>
        <DebouncedTextInputWithVariablesButton
          defaultValue={
            options?.totalLabel ?? defaultConstantSumInputOptions.totalLabel
          }
          onValueChange={(totalLabel) => updateOptions({ totalLabel })}
        />
      </Field.Root>

      <Field.Root>
        <Field.Label>{t("blocks.inputs.settings.button.label")}</Field.Label>
        <DebouncedTextInputWithVariablesButton
          defaultValue={
            options?.buttonLabel ?? defaultConstantSumInputOptions.buttonLabel
          }
          onValueChange={(buttonLabel) => updateOptions({ buttonLabel })}
        />
      </Field.Root>

      <Field.Root>
        <Field.Label>
          {t("blocks.inputs.settings.saveAnswer.label")}
          <MoreInfoTooltip>
            {t("blocks.inputs.constantSum.settings.variable.helperText")}
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
