import { useTranslate } from "@tolgee/react";
import { fileVisibilityOptions } from "@typebot.io/blocks-inputs/file/constants";
import { defaultSignatureInputOptions } from "@typebot.io/blocks-inputs/signature/constants";
import type {
  SignatureInputBlock,
  SignatureInputOptions,
} from "@typebot.io/blocks-inputs/signature/schema";
import { Field } from "@typebot.io/ui/components/Field";
import { MoreInfoTooltip } from "@typebot.io/ui/components/MoreInfoTooltip";
import { Switch } from "@typebot.io/ui/components/Switch";
import type { Variable } from "@typebot.io/variables/schemas";
import { BasicSelect } from "@/components/inputs/BasicSelect";
import { DebouncedTextareaWithVariablesButton } from "@/components/inputs/DebouncedTextarea";
import { DebouncedTextInputWithVariablesButton } from "@/components/inputs/DebouncedTextInput";
import { VariablesCombobox } from "@/components/inputs/VariablesCombobox";

type Props = {
  options: SignatureInputBlock["options"];
  onOptionsChange: (options: SignatureInputBlock["options"]) => void;
};

export const SignatureInputSettings = ({ options, onOptionsChange }: Props) => {
  const { t } = useTranslate();
  const updateOptions = (updates: Partial<SignatureInputOptions>) =>
    onOptionsChange({ ...options, ...updates });
  const isRequired =
    options?.isRequired ?? defaultSignatureInputOptions.isRequired;

  return (
    <div className="flex flex-col gap-4">
      <Field.Root>
        <Field.Label>
          {t("blocks.inputs.signature.settings.question")}
        </Field.Label>
        <DebouncedTextareaWithVariablesButton
          defaultValue={options?.question ?? ""}
          onValueChange={(question) => updateOptions({ question })}
        />
      </Field.Root>

      <Field.Root>
        <Field.Label>
          {t("blocks.inputs.signature.settings.placeholder")}
        </Field.Label>
        <DebouncedTextInputWithVariablesButton
          defaultValue={
            options?.placeholder ?? defaultSignatureInputOptions.placeholder
          }
          onValueChange={(placeholder) => updateOptions({ placeholder })}
        />
      </Field.Root>

      <div className="flex gap-2">
        <Field.Root className="flex-1">
          <Field.Label>
            {t("blocks.inputs.signature.settings.clearLabel")}
          </Field.Label>
          <DebouncedTextInputWithVariablesButton
            defaultValue={
              options?.clearLabel ?? defaultSignatureInputOptions.clearLabel
            }
            onValueChange={(clearLabel) => updateOptions({ clearLabel })}
          />
        </Field.Root>
        <Field.Root className="flex-1">
          <Field.Label>{t("blocks.inputs.settings.button.label")}</Field.Label>
          <DebouncedTextInputWithVariablesButton
            defaultValue={
              options?.buttonLabel ?? defaultSignatureInputOptions.buttonLabel
            }
            onValueChange={(buttonLabel) => updateOptions({ buttonLabel })}
          />
        </Field.Root>
      </div>

      <Field.Root className="flex-row items-center">
        <Switch
          checked={isRequired}
          onCheckedChange={(isRequired) => updateOptions({ isRequired })}
        />
        <Field.Label>
          {t("blocks.inputs.signature.settings.isRequired")}
        </Field.Label>
      </Field.Root>
      {!isRequired && (
        <Field.Root>
          <Field.Label>
            {t("blocks.inputs.signature.settings.skipLabel")}
          </Field.Label>
          <DebouncedTextInputWithVariablesButton
            defaultValue={
              options?.skipLabel ?? defaultSignatureInputOptions.skipLabel
            }
            onValueChange={(skipLabel) => updateOptions({ skipLabel })}
          />
        </Field.Root>
      )}

      <Field.Root>
        <Field.Label>
          {t("blocks.inputs.signature.settings.visibility")}
          <MoreInfoTooltip>
            {t("blocks.inputs.signature.settings.visibility.helperText")}
          </MoreInfoTooltip>
        </Field.Label>
        <BasicSelect
          className="w-full"
          value={options?.visibility}
          defaultValue={defaultSignatureInputOptions.visibility}
          onChange={(
            visibility: (typeof fileVisibilityOptions)[number] | undefined,
          ) => updateOptions({ visibility })}
          items={fileVisibilityOptions}
        />
      </Field.Root>

      <Field.Root>
        <Field.Label>
          {t("blocks.inputs.settings.saveAnswer.label")}
          <MoreInfoTooltip>
            {t("blocks.inputs.signature.settings.variable.helperText")}
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
