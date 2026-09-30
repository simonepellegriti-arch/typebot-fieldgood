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
import { TypingBubble } from "../../../../../components/TypingBubble";
import type { InputSubmitContent } from "../../../../../types";
import { createVideoWatchTracker } from "../helpers/createVideoWatchTracker";

type Props = {
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
  const [isPaused, setIsPaused] = createSignal(true);
  const [isSubmitted, setIsSubmitted] = createSignal(false);
  const tracking = () => props.content?.watchTracking;
  // Only the bubble being displayed now waits for the respondent (older chunks don't).
  const isTrackingInteractive = () =>
    isVideoWatchTrackingActive(props.content) &&
    Boolean(props.onTransitionEnd) &&
    Boolean(props.onCompleted) &&
    !isSubmitted();
  const tracker = createVideoWatchTracker({
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

  const togglePlay = () => {
    if (!videoRef) return;
    if (videoRef.paused) void videoRef.play().catch(() => undefined);
    else videoRef.pause();
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
                <div class="relative w-full">
                  {/* biome-ignore lint/a11y/useMediaCaption: Captions are not available for dynamically configured video bubble sources. */}
                  <video
                    ref={videoRef}
                    src={props.content?.url}
                    poster={props.content?.posterUrl}
                    muted={
                      props.content?.isMuted ??
                      defaultVideoBubbleContent.isMuted
                    }
                    loop={
                      props.content?.isLooping ??
                      defaultVideoBubbleContent.isLooping
                    }
                    playsinline
                    preload="metadata"
                    controls={areControlsDisplayed()}
                    class={cx(
                      "p-4 focus:outline-none w-full relative text-fade-in rounded-md",
                      isTyping()
                        ? "opacity-0 h-8 @xs:h-9"
                        : "opacity-100 h-auto",
                    )}
                    style={{
                      "aspect-ratio": props.content?.aspectRatio,
                      "max-width":
                        props.content?.maxWidth ??
                        defaultVideoBubbleContent.maxWidth,
                    }}
                    onPlay={(event) => {
                      setIsPaused(false);
                      tracker.handlePlay(event.currentTarget);
                    }}
                    onPause={(event) => {
                      setIsPaused(true);
                      tracker.handlePause(event.currentTarget);
                    }}
                    onTimeUpdate={(event) =>
                      tracker.handleTimeUpdate(event.currentTarget)
                    }
                    onSeeking={(event) =>
                      tracker.handleSeeking(event.currentTarget)
                    }
                    onEnded={(event) =>
                      tracker.handleEnded(event.currentTarget)
                    }
                    onLoadedMetadata={(event) =>
                      tracker.handleTimeUpdate(event.currentTarget)
                    }
                  />
                  <Show when={!areControlsDisplayed() && !isTyping()}>
                    <button
                      type="button"
                      class="absolute inset-0 m-4 flex items-center justify-center focus:outline-none focus-visible:ring-2 rounded-md"
                      aria-label={isPaused() ? "Play" : "Pause"}
                      onClick={togglePlay}
                    >
                      <Show when={isPaused()}>
                        <span class="rounded-full bg-black/60 text-white w-14 h-14 flex items-center justify-center text-2xl">
                          ▶
                        </span>
                      </Show>
                    </button>
                  </Show>
                </div>
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
