import { useTranslate } from "@tolgee/react";
import {
  maxMediaAnswerFileSizeMB,
  minMediaAnswerFileSizeMB,
} from "@typebot.io/blocks-inputs/text/mediaAnswerConstants";
import { Field } from "@typebot.io/ui/components/Field";
import { MoreInfoTooltip } from "@typebot.io/ui/components/MoreInfoTooltip";
import { Switch } from "@typebot.io/ui/components/Switch";
import { BasicNumberInput } from "@/components/inputs/BasicNumberInput";

type Props = {
  kind: "audio" | "video";
  allowFileUpload: boolean;
  maxFileSizeMB: number;
  onChange: (updates: {
    allowFileUpload?: boolean;
    maxFileSizeMB?: number;
  }) => void;
};

/** "Respondents can also upload a file" + size limit of voice / video answers. */
export const MediaFileUploadSettings = ({
  kind,
  allowFileUpload,
  maxFileSizeMB,
  onChange,
}: Props) => {
  const { t } = useTranslate();
  return (
    <>
      <Field.Root className="flex-row items-center">
        <Switch
          checked={allowFileUpload}
          onCheckedChange={(allowFileUpload) => onChange({ allowFileUpload })}
        />
        <Field.Label>
          {t(`blocks.inputs.text.settings.mediaUpload.${kind}.label`)}
          <MoreInfoTooltip>
            {t(`blocks.inputs.text.settings.mediaUpload.${kind}.helperText`)}
          </MoreInfoTooltip>
        </Field.Label>
      </Field.Root>
      <Field.Root>
        <Field.Label>
          {t("blocks.inputs.text.settings.mediaUpload.maxFileSize")}
        </Field.Label>
        <BasicNumberInput
          withVariableButton={false}
          min={minMediaAnswerFileSizeMB}
          max={maxMediaAnswerFileSizeMB}
          defaultValue={maxFileSizeMB}
          onValueChange={(maxFileSizeMB) => onChange({ maxFileSizeMB })}
        />
      </Field.Root>
    </>
  );
};
