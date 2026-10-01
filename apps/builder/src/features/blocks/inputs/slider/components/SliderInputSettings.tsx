import { useTranslate } from "@tolgee/react";
import { defaultSliderInputOptions } from "@typebot.io/blocks-inputs/slider/constants";
import type {
  SliderInputBlock,
  SliderInputOptions,
} from "@typebot.io/blocks-inputs/slider/schema";
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
  options: SliderInputBlock["options"];
  onOptionsChange: (options: SliderInputBlock["options"]) => void;
};

export const SliderInputSettings = ({ options, onOptionsChange }: Props) => {
  const { t } = useTranslate();
  const updateOptions = (updates: Partial<SliderInputOptions>) =>
    onOptionsChange({ ...options, ...updates });

  return (
    <div className="flex flex-col gap-4">
      <Field.Root>
        <Field.Label>{t("blocks.inputs.slider.settings.question")}</Field.Label>
        <DebouncedTextareaWithVariablesButton
          defaultValue={options?.question ?? ""}
          onValueChange={(question) => updateOptions({ question })}
        />
      </Field.Root>

      <Field.Root>
        <Field.Label>
          {t("blocks.inputs.slider.settings.statements")}
          <MoreInfoTooltip>
            {t("blocks.inputs.slider.settings.statements.helperText")}
          </MoreInfoTooltip>
        </Field.Label>
        <MatrixEntriesEditor
          entries={options?.rows ?? []}
          addLabel={t("blocks.inputs.slider.settings.addStatement")}
          rowExtras={{ isRequiredVisible: false }}
          onEntriesChange={(rows) =>
            updateOptions({
              rows: rows.map(({ id, label, value, variableId }) => ({
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
          <Field.Label>{t("blocks.inputs.slider.settings.min")}</Field.Label>
          <BasicNumberInput
            withVariableButton={false}
            defaultValue={options?.min ?? defaultSliderInputOptions.min}
            onValueChange={(min) => updateOptions({ min })}
          />
        </Field.Root>
        <Field.Root className="flex-1">
          <Field.Label>{t("blocks.inputs.slider.settings.max")}</Field.Label>
          <BasicNumberInput
            withVariableButton={false}
            defaultValue={options?.max ?? defaultSliderInputOptions.max}
            onValueChange={(max) => updateOptions({ max })}
          />
        </Field.Root>
        <Field.Root className="flex-1">
          <Field.Label>{t("blocks.inputs.slider.settings.step")}</Field.Label>
          <BasicNumberInput
            withVariableButton={false}
            min={0}
            defaultValue={options?.step ?? defaultSliderInputOptions.step}
            onValueChange={(step) =>
              updateOptions({ step: step && step > 0 ? step : undefined })
            }
          />
        </Field.Root>
      </div>

      <Field.Root>
        <Field.Label>
          {t("blocks.inputs.slider.settings.startValue")}
          <MoreInfoTooltip>
            {t("blocks.inputs.slider.settings.startValue.helperText")}
          </MoreInfoTooltip>
        </Field.Label>
        <BasicNumberInput
          withVariableButton={false}
          defaultValue={options?.startValue}
          onValueChange={(startValue) => updateOptions({ startValue })}
        />
      </Field.Root>

      <div className="flex gap-2">
        <Field.Root className="flex-1">
          <Field.Label>
            {t("blocks.inputs.slider.settings.minLabel")}
          </Field.Label>
          <DebouncedTextInputWithVariablesButton
            defaultValue={options?.minLabel ?? ""}
            onValueChange={(minLabel) =>
              updateOptions({ minLabel: minLabel || undefined })
            }
          />
        </Field.Root>
        <Field.Root className="flex-1">
          <Field.Label>
            {t("blocks.inputs.slider.settings.middleLabel")}
          </Field.Label>
          <DebouncedTextInputWithVariablesButton
            defaultValue={options?.middleLabel ?? ""}
            onValueChange={(middleLabel) =>
              updateOptions({ middleLabel: middleLabel || undefined })
            }
          />
        </Field.Root>
        <Field.Root className="flex-1">
          <Field.Label>
            {t("blocks.inputs.slider.settings.maxLabel")}
          </Field.Label>
          <DebouncedTextInputWithVariablesButton
            defaultValue={options?.maxLabel ?? ""}
            onValueChange={(maxLabel) =>
              updateOptions({ maxLabel: maxLabel || undefined })
            }
          />
        </Field.Root>
      </div>

      <Field.Root>
        <Field.Label>
          {t("blocks.inputs.slider.settings.unit")}
          <MoreInfoTooltip>
            {t("blocks.inputs.slider.settings.unit.helperText")}
          </MoreInfoTooltip>
        </Field.Label>
        <DebouncedTextInputWithVariablesButton
          defaultValue={options?.unit ?? ""}
          onValueChange={(unit) => updateOptions({ unit: unit || undefined })}
        />
      </Field.Root>

      <Field.Root className="flex-row items-center">
        <Switch
          checked={
            options?.isInteractionRequired ??
            defaultSliderInputOptions.isInteractionRequired
          }
          onCheckedChange={(isInteractionRequired) =>
            updateOptions({ isInteractionRequired })
          }
        />
        <Field.Label>
          {t("blocks.inputs.slider.settings.isInteractionRequired")}
          <MoreInfoTooltip>
            {t(
              "blocks.inputs.slider.settings.isInteractionRequired.helperText",
            )}
          </MoreInfoTooltip>
        </Field.Label>
      </Field.Root>
      <Field.Root className="flex-row items-center">
        <Switch
          checked={
            options?.isValueVisible ?? defaultSliderInputOptions.isValueVisible
          }
          onCheckedChange={(isValueVisible) =>
            updateOptions({ isValueVisible })
          }
        />
        <Field.Label>
          {t("blocks.inputs.slider.settings.isValueVisible")}
        </Field.Label>
      </Field.Root>
      <Field.Root className="flex-row items-center">
        <Switch
          checked={
            options?.areRowsRandomized ??
            defaultSliderInputOptions.areRowsRandomized
          }
          onCheckedChange={(areRowsRandomized) =>
            updateOptions({ areRowsRandomized })
          }
        />
        <Field.Label>
          {t("blocks.inputs.slider.settings.randomize")}
        </Field.Label>
      </Field.Root>

      <Field.Root>
        <Field.Label>{t("blocks.inputs.settings.button.label")}</Field.Label>
        <DebouncedTextInputWithVariablesButton
          defaultValue={
            options?.buttonLabel ?? defaultSliderInputOptions.buttonLabel
          }
          onValueChange={(buttonLabel) => updateOptions({ buttonLabel })}
        />
      </Field.Root>

      <Field.Root>
        <Field.Label>
          {t("blocks.inputs.settings.saveAnswer.label")}
          <MoreInfoTooltip>
            {t("blocks.inputs.slider.settings.variable.helperText")}
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
