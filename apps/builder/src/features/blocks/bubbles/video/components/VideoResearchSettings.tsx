import { useTranslate } from "@tolgee/react";
import {
  defaultVideoBubbleContent,
  defaultVideoWatchTracking,
} from "@typebot.io/blocks-bubbles/video/constants";
import type {
  VideoBubbleBlock,
  VideoWatchTracking,
} from "@typebot.io/blocks-bubbles/video/schema";
import { Field } from "@typebot.io/ui/components/Field";
import { MoreInfoTooltip } from "@typebot.io/ui/components/MoreInfoTooltip";
import { Switch } from "@typebot.io/ui/components/Switch";
import type { Variable } from "@typebot.io/variables/schemas";
import { BasicNumberInput } from "@/components/inputs/BasicNumberInput";
import { DebouncedTextInputWithVariablesButton } from "@/components/inputs/DebouncedTextInput";
import { VariablesCombobox } from "@/components/inputs/VariablesCombobox";
import { VideoCompatibilityCheck } from "./VideoCompatibilityCheck";

type Props = {
  content: NonNullable<VideoBubbleBlock["content"]>;
  onSubmit: (content: VideoBubbleBlock["content"]) => void;
};

/**
 * Native video file options (muted, loop, poster) and research tracking
 * (required viewing, minimum %, seeking, auto continue, saved variable).
 */
export const VideoResearchSettings = ({ content, onSubmit }: Props) => {
  const { t } = useTranslate();
  const tracking = content.watchTracking;
  const isTrackingEnabled =
    tracking?.isEnabled ?? defaultVideoWatchTracking.isEnabled;
  const isAutoplayEnabled =
    content.isAutoplayEnabled ?? defaultVideoBubbleContent.isAutoplayEnabled;
  const isMuted = content.isMuted ?? defaultVideoBubbleContent.isMuted;

  const updateTracking = (updates: Partial<VideoWatchTracking>) =>
    onSubmit({ ...content, watchTracking: { ...tracking, ...updates } });

  return (
    <div className="flex flex-col gap-4 border-t border-gray-6 pt-4">
      <VideoCompatibilityCheck url={content.url} />
      <Field.Root>
        <Field.Label>
          {t("video.settings.fallback")}
          <MoreInfoTooltip>
            {t("video.settings.fallback.helperText")}
          </MoreInfoTooltip>
        </Field.Label>
        <DebouncedTextInputWithVariablesButton
          placeholder="https://.../video.webm"
          defaultValue={content.fallbackUrl ?? ""}
          onValueChange={(fallbackUrl) =>
            onSubmit({ ...content, fallbackUrl: fallbackUrl || undefined })
          }
        />
      </Field.Root>
      <Field.Root className="flex-row items-center">
        <Switch
          checked={isMuted}
          onCheckedChange={(isMuted) => onSubmit({ ...content, isMuted })}
        />
        <Field.Label>{t("video.settings.muted")}</Field.Label>
      </Field.Root>
      {isAutoplayEnabled && !isMuted && (
        <p className="text-xs text-gray-10">
          {t("video.settings.autoplayWithSound.warning")}
        </p>
      )}
      <Field.Root className="flex-row items-center">
        <Switch
          checked={content.isLooping ?? defaultVideoBubbleContent.isLooping}
          onCheckedChange={(isLooping) => onSubmit({ ...content, isLooping })}
        />
        <Field.Label>{t("video.settings.loop")}</Field.Label>
      </Field.Root>
      <Field.Root>
        <Field.Label>{t("video.settings.poster")}</Field.Label>
        <DebouncedTextInputWithVariablesButton
          placeholder="https://..."
          defaultValue={content.posterUrl ?? ""}
          onValueChange={(posterUrl) =>
            onSubmit({ ...content, posterUrl: posterUrl || undefined })
          }
        />
      </Field.Root>

      <Field.Container>
        <Field.Root className="flex-row items-center">
          <Switch
            checked={isTrackingEnabled}
            onCheckedChange={(isEnabled) => updateTracking({ isEnabled })}
          />
          <Field.Label className="font-medium">
            {t("video.tracking.enable")}
            <MoreInfoTooltip>{t("video.tracking.helperText")}</MoreInfoTooltip>
          </Field.Label>
        </Field.Root>
        {isTrackingEnabled && (
          <>
            <Field.Root className="flex-row items-center">
              <Switch
                checked={
                  tracking?.isRequired ?? defaultVideoWatchTracking.isRequired
                }
                onCheckedChange={(isRequired) => updateTracking({ isRequired })}
              />
              <Field.Label>{t("video.tracking.requireWatch")}</Field.Label>
            </Field.Root>
            {(tracking?.isRequired ?? defaultVideoWatchTracking.isRequired) && (
              <>
                <Field.Root>
                  <Field.Label>
                    {t("video.tracking.minimumPercentage")}
                  </Field.Label>
                  <BasicNumberInput
                    withVariableButton={false}
                    min={0}
                    max={100}
                    defaultValue={
                      tracking?.minimumWatchPercentage ??
                      defaultVideoWatchTracking.minimumWatchPercentage
                    }
                    onValueChange={(minimumWatchPercentage) =>
                      updateTracking({ minimumWatchPercentage })
                    }
                  />
                </Field.Root>
                <Field.Root>
                  <Field.Label>
                    {t("video.tracking.requirementMessage")}
                  </Field.Label>
                  <DebouncedTextInputWithVariablesButton
                    defaultValue={
                      tracking?.requirementMessage ??
                      defaultVideoWatchTracking.requirementMessage
                    }
                    onValueChange={(requirementMessage) =>
                      updateTracking({ requirementMessage })
                    }
                  />
                </Field.Root>
              </>
            )}
            <Field.Root className="flex-row items-center">
              <Switch
                checked={
                  tracking?.allowSeeking ??
                  defaultVideoWatchTracking.allowSeeking
                }
                onCheckedChange={(allowSeeking) =>
                  updateTracking({ allowSeeking })
                }
              />
              <Field.Label>
                {t("video.tracking.allowSeeking")}
                <MoreInfoTooltip>
                  {t("video.tracking.allowSeeking.helperText")}
                </MoreInfoTooltip>
              </Field.Label>
            </Field.Root>
            <Field.Root className="flex-row items-center">
              <Switch
                checked={
                  tracking?.autoContinueOnEnd ??
                  defaultVideoWatchTracking.autoContinueOnEnd
                }
                onCheckedChange={(autoContinueOnEnd) =>
                  updateTracking({ autoContinueOnEnd })
                }
              />
              <Field.Label>{t("video.tracking.autoContinue")}</Field.Label>
            </Field.Root>
            <Field.Root>
              <Field.Label>
                {t("blocks.inputs.settings.button.label")}
              </Field.Label>
              <DebouncedTextInputWithVariablesButton
                defaultValue={
                  tracking?.buttonLabel ?? defaultVideoWatchTracking.buttonLabel
                }
                onValueChange={(buttonLabel) => updateTracking({ buttonLabel })}
              />
            </Field.Root>
            <Field.Root>
              <Field.Label>
                {t("video.tracking.variable")}
                <MoreInfoTooltip>
                  {t("video.tracking.variable.helperText")}
                </MoreInfoTooltip>
              </Field.Label>
              <VariablesCombobox
                initialVariableId={tracking?.variableId}
                onSelectVariable={(variable?: Variable) =>
                  updateTracking({ variableId: variable?.id })
                }
              />
            </Field.Root>
          </>
        )}
      </Field.Container>
    </div>
  );
};
