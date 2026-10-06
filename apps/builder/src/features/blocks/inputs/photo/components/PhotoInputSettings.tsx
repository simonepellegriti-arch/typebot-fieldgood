import { useTranslate } from "@tolgee/react";
import { fileVisibilityOptions } from "@typebot.io/blocks-inputs/file/constants";
import {
  defaultPhotoInputOptions,
  maxPhotosLimit,
} from "@typebot.io/blocks-inputs/photo/constants";
import type {
  PhotoInputBlock,
  PhotoInputOptions,
} from "@typebot.io/blocks-inputs/photo/schema";
import { Field } from "@typebot.io/ui/components/Field";
import { MoreInfoTooltip } from "@typebot.io/ui/components/MoreInfoTooltip";
import { Switch } from "@typebot.io/ui/components/Switch";
import type { Variable } from "@typebot.io/variables/schemas";
import { BasicNumberInput } from "@/components/inputs/BasicNumberInput";
import { BasicSelect } from "@/components/inputs/BasicSelect";
import { DebouncedTextareaWithVariablesButton } from "@/components/inputs/DebouncedTextarea";
import { DebouncedTextInputWithVariablesButton } from "@/components/inputs/DebouncedTextInput";
import { VariablesCombobox } from "@/components/inputs/VariablesCombobox";

type Props = {
  options: PhotoInputBlock["options"];
  onOptionsChange: (options: PhotoInputBlock["options"]) => void;
};

export const PhotoInputSettings = ({ options, onOptionsChange }: Props) => {
  const { t } = useTranslate();
  const updateOptions = (updates: Partial<PhotoInputOptions>) =>
    onOptionsChange({ ...options, ...updates });
  const isRequired = options?.isRequired ?? defaultPhotoInputOptions.isRequired;

  return (
    <div className="flex flex-col gap-4">
      <Field.Root>
        <Field.Label>{t("blocks.inputs.photo.settings.question")}</Field.Label>
        <DebouncedTextareaWithVariablesButton
          defaultValue={options?.question ?? ""}
          onValueChange={(question) => updateOptions({ question })}
        />
      </Field.Root>

      <Field.Root>
        <Field.Label>
          {t("blocks.inputs.photo.settings.maxPhotos")}
          <MoreInfoTooltip>
            {t("blocks.inputs.photo.settings.maxPhotos.helperText")}
          </MoreInfoTooltip>
        </Field.Label>
        <BasicNumberInput
          withVariableButton={false}
          min={1}
          max={maxPhotosLimit}
          defaultValue={
            options?.maxPhotos ?? defaultPhotoInputOptions.maxPhotos
          }
          onValueChange={(maxPhotos) =>
            updateOptions({
              maxPhotos:
                maxPhotos === undefined
                  ? undefined
                  : Math.min(
                      maxPhotosLimit,
                      Math.max(1, Math.round(maxPhotos)),
                    ),
            })
          }
        />
      </Field.Root>

      <Field.Root>
        <Field.Label>{t("blocks.inputs.photo.settings.source")}</Field.Label>
        <BasicSelect
          value={options?.source}
          defaultValue={defaultPhotoInputOptions.source}
          items={[
            {
              label: t("blocks.inputs.photo.settings.source.camera"),
              value: "camera" as const,
            },
            {
              label: t("blocks.inputs.photo.settings.source.cameraOrGallery"),
              value: "cameraOrGallery" as const,
            },
          ]}
          onChange={(source) => updateOptions({ source })}
        />
      </Field.Root>

      <Field.Root>
        <Field.Label>
          {t("blocks.inputs.photo.settings.facingMode")}
        </Field.Label>
        <BasicSelect
          value={options?.facingMode}
          defaultValue={defaultPhotoInputOptions.facingMode}
          items={[
            {
              label: t("blocks.inputs.photo.settings.facingMode.environment"),
              value: "environment" as const,
            },
            {
              label: t("blocks.inputs.photo.settings.facingMode.user"),
              value: "user" as const,
            },
          ]}
          onChange={(facingMode) => updateOptions({ facingMode })}
        />
      </Field.Root>

      <Field.Root>
        <Field.Label>{t("blocks.inputs.settings.button.label")}</Field.Label>
        <DebouncedTextInputWithVariablesButton
          defaultValue={
            options?.buttonLabel ?? defaultPhotoInputOptions.buttonLabel
          }
          onValueChange={(buttonLabel) => updateOptions({ buttonLabel })}
        />
      </Field.Root>

      <Field.Root className="flex-row items-center">
        <Switch
          checked={isRequired}
          onCheckedChange={(isRequired) => updateOptions({ isRequired })}
        />
        <Field.Label>
          {t("blocks.inputs.photo.settings.isRequired")}
        </Field.Label>
      </Field.Root>
      {!isRequired && (
        <Field.Root>
          <Field.Label>
            {t("blocks.inputs.photo.settings.skipLabel")}
          </Field.Label>
          <DebouncedTextInputWithVariablesButton
            defaultValue={
              options?.skipLabel ?? defaultPhotoInputOptions.skipLabel
            }
            onValueChange={(skipLabel) => updateOptions({ skipLabel })}
          />
        </Field.Root>
      )}

      <Field.Root>
        <Field.Label>
          {t("blocks.inputs.photo.settings.visibility")}
          <MoreInfoTooltip>
            {t("blocks.inputs.photo.settings.visibility.helperText")}
          </MoreInfoTooltip>
        </Field.Label>
        <BasicSelect
          className="w-full"
          value={options?.visibility}
          defaultValue={defaultPhotoInputOptions.visibility}
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
            {t("blocks.inputs.photo.settings.variable.helperText")}
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
