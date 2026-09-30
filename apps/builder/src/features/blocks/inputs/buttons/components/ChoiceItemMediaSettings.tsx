import { useTranslate } from "@tolgee/react";
import { defaultChoiceItemMediaOptions } from "@typebot.io/blocks-inputs/choice/constants";
import type { ButtonItem } from "@typebot.io/blocks-inputs/choice/schema";
import { Button } from "@typebot.io/ui/components/Button";
import { Field } from "@typebot.io/ui/components/Field";
import { MoreInfoTooltip } from "@typebot.io/ui/components/MoreInfoTooltip";
import { Switch } from "@typebot.io/ui/components/Switch";
import { UploadButton } from "@/components/ImageUploadContent/UploadButton";
import { BasicSelect } from "@/components/inputs/BasicSelect";
import { DebouncedTextInputWithVariablesButton } from "@/components/inputs/DebouncedTextInput";
import { VideoCompatibilityCheck } from "@/features/blocks/bubbles/video/components/VideoCompatibilityCheck";
import type { FilePathUploadProps } from "@/features/upload/api/generateUploadUrl";

type ChoiceItemMedia = NonNullable<ButtonItem["media"]>;

type Props = {
  media: ButtonItem["media"];
  uploadFileProps?: FilePathUploadProps;
  onMediaChange: (media: ButtonItem["media"]) => void;
};

/**
 * Image or video clip shown with a choice option. The clip plays inside the
 * option; playing it never selects the option. Codes and labels are unchanged.
 */
export const ChoiceItemMediaSettings = ({
  media,
  uploadFileProps,
  onMediaChange,
}: Props) => {
  const { t } = useTranslate();
  const mediaType = media?.type;

  const updateMedia = (updates: Partial<ChoiceItemMedia>) =>
    onMediaChange({ type: mediaType ?? "video", ...media, ...updates });

  return (
    <Field.Container>
      <Field.Root>
        <Field.Label>
          {t("blocks.inputs.button.buttonSettings.media.label")}
          <MoreInfoTooltip>
            {t("blocks.inputs.button.buttonSettings.media.helperText")}
          </MoreInfoTooltip>
        </Field.Label>
        <BasicSelect
          className="w-full"
          value={mediaType ?? "none"}
          items={[
            {
              label: t("blocks.inputs.button.buttonSettings.media.none"),
              value: "none" as const,
            },
            {
              label: t("blocks.inputs.button.buttonSettings.media.video"),
              value: "video" as const,
            },
            {
              label: t("blocks.inputs.button.buttonSettings.media.image"),
              value: "image" as const,
            },
          ]}
          onChange={(type) =>
            onMediaChange(
              type === "video" || type === "image"
                ? { ...media, type }
                : undefined,
            )
          }
        />
      </Field.Root>
      {media && (
        <>
          <Field.Root>
            <Field.Label>URL</Field.Label>
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <DebouncedTextInputWithVariablesButton
                  placeholder={
                    media.type === "video"
                      ? "https://.../clip.mp4"
                      : "https://.../image.jpg"
                  }
                  defaultValue={media.url ?? ""}
                  onValueChange={(url) =>
                    updateMedia({ url: url.trim() || undefined })
                  }
                />
              </div>
              {uploadFileProps && (
                <UploadButton
                  fileType={media.type}
                  filePathProps={uploadFileProps}
                  onFileUploaded={(url) => updateMedia({ url })}
                  variant="secondary"
                >
                  {t("video.upload.tab")}
                </UploadButton>
              )}
            </div>
          </Field.Root>
          {media.type === "video" && (
            <>
              <VideoCompatibilityCheck url={media.url} />
              <Field.Root>
                <Field.Label>
                  {t("video.settings.fallback")}
                  <MoreInfoTooltip>
                    {t("video.settings.fallback.helperText")}
                  </MoreInfoTooltip>
                </Field.Label>
                <DebouncedTextInputWithVariablesButton
                  placeholder="https://.../clip.webm"
                  defaultValue={media.fallbackUrl ?? ""}
                  onValueChange={(fallbackUrl) =>
                    updateMedia({
                      fallbackUrl: fallbackUrl.trim() || undefined,
                    })
                  }
                />
              </Field.Root>
              <Field.Root>
                <Field.Label>{t("video.settings.poster")}</Field.Label>
                <DebouncedTextInputWithVariablesButton
                  placeholder="https://..."
                  defaultValue={media.posterUrl ?? ""}
                  onValueChange={(posterUrl) =>
                    updateMedia({ posterUrl: posterUrl.trim() || undefined })
                  }
                />
              </Field.Root>
              <Field.Root className="flex-row items-center">
                <Switch
                  checked={
                    media.areControlsDisplayed ??
                    defaultChoiceItemMediaOptions.areControlsDisplayed
                  }
                  onCheckedChange={(areControlsDisplayed) =>
                    updateMedia({ areControlsDisplayed })
                  }
                />
                <Field.Label>
                  {t("blocks.inputs.button.buttonSettings.media.controls")}
                </Field.Label>
              </Field.Root>
              <Field.Root className="flex-row items-center">
                <Switch
                  checked={
                    media.isMuted ?? defaultChoiceItemMediaOptions.isMuted
                  }
                  onCheckedChange={(isMuted) => updateMedia({ isMuted })}
                />
                <Field.Label>{t("video.settings.muted")}</Field.Label>
              </Field.Root>
            </>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onMediaChange(undefined)}
          >
            {t("blocks.inputs.button.buttonSettings.media.remove")}
          </Button>
        </>
      )}
    </Field.Container>
  );
};
