import {
  defaultVideoBubbleContent,
  defaultVideoWatchTracking,
  embedBaseUrls,
  embeddableVideoTypes,
  VideoBubbleContentType,
} from "@typebot.io/blocks-bubbles/video/constants";
import { parseQueryParams } from "@typebot.io/blocks-bubbles/video/helpers";
import type {
  EmbeddableVideoBubbleContentType,
  VideoBubbleBlock,
} from "@typebot.io/blocks-bubbles/video/schema";
import { isVideoWatchTrackingActive } from "@typebot.io/blocks-bubbles/video/watch/isVideoWatchTrackingActive";
import { cx } from "@typebot.io/ui/lib/cva";
import {
  createSignal,
  Match,
  onCleanup,
  onMount,
  Show,
  Switch,
} from "solid-js";
import { Button } from "../../../../../components/Button";
import { createVideoResumeStore } from "../../../../../components/media/createVideoResumeStore";
import { RobustVideoPlayer } from "../../../../../components/media/RobustVideoPlayer";
import { TypingBubble } from "../../../../../components/TypingBubble";
import type { InputSubmitContent } from "../../../../../types";
import { createVideoWatchTracker } from "../helpers/createVideoWatchTracker";

type Props = {
  /** Message id, used to resume the video when the respondent comes back to it. */
  bubbleId?: string;
  content: VideoBubbleBlock["content"];
  onTransitionEnd?: (ref?: HTMLDivElement) => void;
  onCompleted?: (reply?: InputSubmitContent) => void;
};

export const showAnimationDuration = 400;
let typingTimeout: NodeJS.Timeout;

export const VideoBubble = (props: Props) => {
  let ref: HTMLDivElement | undefined;
  let videoRef: HTMLVideoElement | undefined;
  const [isTyping, setIsTyping] = createSignal(!!props.onTransitionEnd);
  const [isSubmitted, setIsSubmitted] = createSignal(false);
  const tracking = () => props.content?.watchTracking;
  // Only the bubble being displayed now waits for the respondent (older chunks don't).
  const isTrackingInteractive = () =>
    isVideoWatchTrackingActive(props.content) &&
    Boolean(props.onTransitionEnd) &&
    Boolean(props.onCompleted) &&
    !isSubmitted();
  // Coming back to the same video (e.g. page reload) resumes position and progress.
  const resumeStore = createVideoResumeStore(
    props.bubbleId && props.content?.url
      ? `${props.bubbleId}:${props.content.url}`
      : undefined,
  );
  const resumeState = resumeStore.read();
  const saveResumeState = (video: HTMLVideoElement) =>
    resumeStore.write(tracker.getResumeState(video));
  const tracker = createVideoWatchTracker({
    initialState: resumeState,
    tracking: () => tracking(),
    onEnded: () => {
      if (
        isTrackingInteractive() &&
        (tracking()?.autoContinueOnEnd ??
          defaultVideoWatchTracking.autoContinueOnEnd)
      )
        submitWatchResult();
    },
  });

  const submitWatchResult = () => {
    if (!isTrackingInteractive() || !tracker.isRequirementMet()) return;
    setIsSubmitted(true);
    videoRef?.pause();
    const result = tracker.getResult();
    props.onCompleted?.({
      type: "text",
      value: JSON.stringify(result),
      structuredReply: { type: "video", result },
    });
  };

  /** Browsers block autoplay with sound: retry muted, then leave the play button. */
  const attemptAutoplay = async () => {
    if (!videoRef) return;
    try {
      await videoRef.play();
    } catch {
      videoRef.muted = true;
      await videoRef.play().catch(() => undefined);
    }
  };

  const isAutoplayEnabled = () =>
    props.content?.isAutoplayEnabled ??
    defaultVideoBubbleContent.isAutoplayEnabled;
  const areControlsDisplayed = () =>
    props.content?.areControlsDisplayed ??
    defaultVideoBubbleContent.areControlsDisplayed;

  onMount(() => {
    const typingDuration =
      props.content?.type &&
      embeddableVideoTypes.includes(
        props.content?.type as EmbeddableVideoBubbleContentType,
      )
        ? 2000
        : 100;
    typingTimeout = setTimeout(() => {
      if (!isTyping()) return;
      setIsTyping(false);
      if (
        props.onTransitionEnd &&
        props.content?.type === VideoBubbleContentType.URL &&
        isAutoplayEnabled()
      )
        void attemptAutoplay();
      setTimeout(() => {
        props.onTransitionEnd?.(ref);
      }, showAnimationDuration);
    }, typingDuration);
  });

  onCleanup(() => {
    if (typingTimeout) clearTimeout(typingTimeout);
  });

  return (
    <div
      class={cx(
        "flex flex-col w-full",
        props.onTransitionEnd ? "animate-fade-in" : undefined,
      )}
      ref={ref}
    >
      <div class="flex w-full items-center">
        <div class="flex relative z-10 items-start typebot-host-bubble overflow-hidden w-full max-w-full">
          <div
            class="flex items-center absolute px-4 py-2 bubble-typing z-10 "
            style={{
              width: isTyping() ? "64px" : "100%",
              height: isTyping() ? "32px" : "100%",
              "max-width":
                props.content?.maxWidth ?? defaultVideoBubbleContent.maxWidth,
            }}
          >
            {isTyping() && <TypingBubble />}
          </div>
          <Switch>
            <Match
              when={
                props.content?.type &&
                props.content.type === VideoBubbleContentType.URL
              }
            >
              <div class="flex flex-col w-full relative z-20">
                <RobustVideoPlayer
                  src={props.content?.url ?? ""}
                  fallbackSrc={props.content?.fallbackUrl}
                  poster={props.content?.posterUrl}
                  isMuted={
                    props.content?.isMuted ?? defaultVideoBubbleContent.isMuted
                  }
                  isLooping={
                    props.content?.isLooping ??
                    defaultVideoBubbleContent.isLooping
                  }
                  areControlsDisplayed={areControlsDisplayed()}
                  startTime={resumeState?.currentTime}
                  class={cx(
                    "p-4 text-fade-in",
                    isTyping() ? "opacity-0 h-8 @xs:h-9" : "opacity-100",
                  )}
                  style={{
                    "aspect-ratio": props.content?.aspectRatio,
                    "max-width":
                      props.content?.maxWidth ??
                      defaultVideoBubbleContent.maxWidth,
                  }}
                  ref={(video) => {
                    videoRef = video;
                  }}
                  onPlay={(video) => tracker.handlePlay(video)}
                  onPause={(video) => {
                    tracker.handlePause(video);
                    saveResumeState(video);
                  }}
                  onTimeUpdate={(video) => {
                    tracker.handleTimeUpdate(video);
                    saveResumeState(video);
                  }}
                  onSeeking={(video) => tracker.handleSeeking(video)}
                  onSeeked={(video) => tracker.handleTimeUpdate(video)}
                  onEnded={(video) => {
                    tracker.handleEnded(video);
                    saveResumeState(video);
                  }}
                  onLoadedMetadata={(video) => tracker.handleTimeUpdate(video)}
                />
                <Show when={isTrackingInteractive() && !isTyping()}>
                  <div class="flex flex-col gap-2 px-4 pb-4">
                    <Show
                      when={
                        (tracking()?.isRequired ??
                          defaultVideoWatchTracking.isRequired) &&
                        !tracker.isRequirementMet()
                      }
                    >
                      <p class="text-sm" aria-live="polite">
                        {tracking()?.requirementMessage ??
                          defaultVideoWatchTracking.requirementMessage}
                      </p>
                      <div
                        class="h-1 w-full rounded-full bg-black/10 overflow-hidden"
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={Math.round(
                          tracker.progress().watchedPercentage,
                        )}
                      >
                        <div
                          class="h-full typebot-checkbox checked"
                          style={{
                            width: `${Math.min(
                              100,
                              (tracker.progress().watchedPercentage /
                                Math.max(
                                  1,
                                  tracking()?.minimumWatchPercentage ??
                                    defaultVideoWatchTracking.minimumWatchPercentage,
                                )) *
                                100,
                            )}%`,
                          }}
                        />
                      </div>
                    </Show>
                    <Button
                      class="self-end"
                      isDisabled={!tracker.isRequirementMet()}
                      on:click={submitWatchResult}
                    >
                      {tracking()?.buttonLabel ??
                        defaultVideoWatchTracking.buttonLabel}
                    </Button>
                  </div>
                </Show>
              </div>
            </Match>
            <Match
              when={
                props.content?.type &&
                embeddableVideoTypes.includes(
                  props.content.type as EmbeddableVideoBubbleContentType,
                )
              }
            >
              <div
                class={cx(
                  "p-4 relative z-20 text-fade-in w-full aspect-(--aspect-ratio)",
                  isTyping() ? "opacity-0 h-8 @xs:h-9" : "opacity-100",
                  !props.content?.aspectRatio && "h-(--height)",
                )}
                style={{
                  "--aspect-ratio": props.content?.aspectRatio,
                  "--height": `${
                    props.content?.height ?? defaultVideoBubbleContent.height
                  }px`,
                  "max-width":
                    props.content?.maxWidth ??
                    defaultVideoBubbleContent.maxWidth,
                }}
              >
                <iframe
                  title="Video content"
                  src={`${
                    embedBaseUrls[
                      props.content?.type as EmbeddableVideoBubbleContentType
                    ]
                  }/${props.content?.id ?? ""}${
                    props.content?.queryParamsStr ??
                    `?${parseQueryParams(props.content)}`
                  }`}
                  class={"w-full h-full"}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowfullscreen
                />
              </div>
            </Match>
          </Switch>
        </div>
      </div>
    </div>
  );
};
