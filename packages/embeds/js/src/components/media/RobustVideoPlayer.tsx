import { getVideoMimeType } from "@typebot.io/blocks-bubbles/video/media/getVideoMimeType";
import { cx } from "@typebot.io/ui/lib/cva";
import { createSignal, type JSX, onCleanup, onMount, Show } from "solid-js";
import { formatVideoTime } from "./formatVideoTime";
import { getVideoPlayerLabels } from "./getVideoPlayerLabels";

type MediaEventHandler = (video: HTMLVideoElement) => void;

type Props = {
  src: string;
  /** Second source (e.g. WebM) used when the browser can't play the first one. */
  fallbackSrc?: string;
  poster?: string;
  isMuted?: boolean;
  isLooping?: boolean;
  /** Native controls. When false a minimal play / pause / replay / mute bar is shown. */
  areControlsDisplayed: boolean;
  /** Tries to autoplay once mounted: muted if the browser blocks sound, else shows Play. */
  isAutoplayRequested?: boolean;
  /** Seconds to resume from (the respondent came back to this video). */
  startTime?: number;
  class?: string;
  style?: JSX.CSSProperties;
  ref?: (video: HTMLVideoElement) => void;
  onPlay?: MediaEventHandler;
  onPause?: MediaEventHandler;
  onTimeUpdate?: MediaEventHandler;
  onSeeking?: MediaEventHandler;
  onSeeked?: MediaEventHandler;
  onEnded?: MediaEventHandler;
  onLoadedMetadata?: MediaEventHandler;
};

type Status = "loading" | "ready" | "buffering" | "error";

/** Time without progress before a loading / buffering state shows a retry button. */
const stallTimeoutMs = 15_000;

/**
 * HTML5 video that behaves the same on Chrome, Edge, Safari (macOS / iOS) and
 * Chrome Android: inline playback on iPhone (playsinline + webkit-playsinline),
 * explicit MIME types on <source>, optional fallback source, autoplay that
 * respects browser policies (muted fallback, then a Play button), and visible
 * loading / buffering / error states with a retry instead of a blank player.
 */
export const RobustVideoPlayer = (props: Props) => {
  let videoRef: HTMLVideoElement | undefined;
  let stallTimeout: ReturnType<typeof setTimeout> | undefined;
  const labels = getVideoPlayerLabels();
  const [status, setStatus] = createSignal<Status>("loading");
  const [isStalled, setIsStalled] = createSignal(false);
  const [isPaused, setIsPaused] = createSignal(true);
  const [isEnded, setIsEnded] = createSignal(false);
  const [isMuted, setIsMuted] = createSignal(Boolean(props.isMuted));
  const [currentTime, setCurrentTime] = createSignal(0);
  const [duration, setDuration] = createSignal<number>();
  let hasRestoredStartTime = false;

  const armStallTimeout = () => {
    clearStallTimeout();
    stallTimeout = setTimeout(() => setIsStalled(true), stallTimeoutMs);
  };
  const clearStallTimeout = () => {
    if (stallTimeout) clearTimeout(stallTimeout);
    setIsStalled(false);
  };

  const setVideoRef = (video: HTMLVideoElement) => {
    videoRef = video;
    // Older iOS Safari versions only honour the prefixed attribute.
    video.setAttribute("webkit-playsinline", "");
    video.setAttribute("playsinline", "");
    if (props.isMuted) {
      video.muted = true;
      video.defaultMuted = true;
    }
    props.ref?.(video);
  };

  const play = async () => {
    if (!videoRef) return;
    try {
      await videoRef.play();
    } catch {
      // Autoplay with sound blocked (Safari, Chrome without user gesture): retry muted.
      videoRef.muted = true;
      setIsMuted(true);
      await videoRef.play().catch(() => setIsPaused(true));
    }
  };

  const togglePlay = () => {
    if (!videoRef) return;
    if (videoRef.paused || videoRef.ended) void play();
    else videoRef.pause();
  };

  const replay = () => {
    if (!videoRef) return;
    videoRef.currentTime = 0;
    void play();
  };

  const toggleMute = () => {
    if (!videoRef) return;
    videoRef.muted = !videoRef.muted;
    setIsMuted(videoRef.muted);
  };

  const retry = () => {
    if (!videoRef) return;
    const resumeTime = videoRef.currentTime;
    setStatus("loading");
    armStallTimeout();
    hasRestoredStartTime = false;
    videoRef.load();
    if (resumeTime > 0) videoRef.currentTime = resumeTime;
  };

  const handleSourceError = () => {
    // <source> errors fire per source: the video is only unplayable once none is left.
    queueMicrotask(() => {
      if (videoRef?.networkState === HTMLMediaElement.NETWORK_NO_SOURCE) {
        clearStallTimeout();
        setStatus("error");
      }
    });
  };

  onMount(() => {
    // <source> elements get their src after being inserted: WebKit (Safari,
    // iOS) has then already run the resource selection with empty sources and
    // never loads the video. Restart the selection now that sources are set.
    if (videoRef && videoRef.networkState === HTMLMediaElement.NETWORK_EMPTY)
      videoRef.load();
    armStallTimeout();
    if (props.isAutoplayRequested) void play();
  });
  onCleanup(clearStallTimeout);

  return (
    <div class={cx("relative w-full", props.class)} style={props.style}>
      <video
        ref={setVideoRef}
        poster={props.poster}
        loop={props.isLooping}
        muted={props.isMuted}
        preload="metadata"
        controls={props.areControlsDisplayed && status() !== "error"}
        class="w-full h-auto rounded-md bg-black/5 focus:outline-none"
        onLoadedMetadata={(event) => {
          const video = event.currentTarget;
          setDuration(
            Number.isFinite(video.duration) ? video.duration : undefined,
          );
          if (!hasRestoredStartTime && props.startTime && props.startTime > 0) {
            hasRestoredStartTime = true;
            video.currentTime = Math.min(
              props.startTime,
              video.duration || props.startTime,
            );
          }
          props.onLoadedMetadata?.(video);
        }}
        onCanPlay={() => {
          clearStallTimeout();
          if (status() !== "error") setStatus("ready");
        }}
        onPlaying={() => {
          clearStallTimeout();
          setStatus("ready");
        }}
        onWaiting={() => {
          setStatus("buffering");
          armStallTimeout();
        }}
        onStalled={() => armStallTimeout()}
        onPlay={(event) => {
          setIsPaused(false);
          setIsEnded(false);
          props.onPlay?.(event.currentTarget);
        }}
        onPause={(event) => {
          setIsPaused(true);
          props.onPause?.(event.currentTarget);
        }}
        onTimeUpdate={(event) => {
          setCurrentTime(event.currentTarget.currentTime);
          props.onTimeUpdate?.(event.currentTarget);
        }}
        onSeeking={(event) => props.onSeeking?.(event.currentTarget)}
        onSeeked={(event) => props.onSeeked?.(event.currentTarget)}
        onEnded={(event) => {
          setIsEnded(true);
          setIsPaused(true);
          props.onEnded?.(event.currentTarget);
        }}
        onVolumeChange={(event) => setIsMuted(event.currentTarget.muted)}
        onError={() => {
          clearStallTimeout();
          setStatus("error");
        }}
      >
        <source
          src={props.src}
          type={getVideoMimeType(props.src)}
          onError={handleSourceError}
        />
        <Show when={props.fallbackSrc}>
          {(fallbackSrc) => (
            <source
              src={fallbackSrc()}
              type={getVideoMimeType(fallbackSrc())}
              onError={handleSourceError}
            />
          )}
        </Show>
      </video>

      <Show when={status() === "error"}>
        <div
          class="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-md bg-black/70 text-white text-sm p-4 text-center"
          role="alert"
        >
          <span>{labels.error}</span>
          <button
            type="button"
            class="rounded-md bg-white/90 text-black px-3 py-1 font-semibold focus:outline-none focus-visible:ring-2"
            onClick={retry}
          >
            {labels.retry}
          </button>
        </div>
      </Show>

      <Show
        when={status() !== "error" && (status() !== "ready" || isStalled())}
      >
        <div
          class="absolute left-2 bottom-2 flex items-center gap-2 rounded-md bg-black/60 text-white text-xs px-2 py-1"
          aria-live="polite"
        >
          <span>
            {status() === "loading" ? labels.loading : labels.buffering}
          </span>
          <Show when={isStalled()}>
            <button
              type="button"
              class="underline font-semibold focus:outline-none focus-visible:ring-2"
              onClick={retry}
            >
              {labels.retry}
            </button>
          </Show>
        </div>
      </Show>

      <Show when={!props.areControlsDisplayed && status() !== "error"}>
        <div class="flex items-center gap-2 pt-2 text-sm">
          <button
            type="button"
            class="rounded-md px-3 py-1 font-semibold typebot-selectable focus:outline-none focus-visible:ring-2"
            onClick={() => (isEnded() ? replay() : togglePlay())}
            aria-label={
              isEnded()
                ? labels.replay
                : isPaused()
                  ? labels.play
                  : labels.pause
            }
          >
            {isEnded() ? "↺" : isPaused() ? "▶" : "❚❚"}
          </button>
          <button
            type="button"
            class="rounded-md px-3 py-1 typebot-selectable focus:outline-none focus-visible:ring-2"
            onClick={toggleMute}
            aria-label={isMuted() ? labels.unmute : labels.mute}
            aria-pressed={isMuted()}
          >
            {isMuted() ? "🔇" : "🔊"}
          </button>
          <Show when={duration() !== undefined}>
            <span class="tabular-nums opacity-80" aria-hidden="true">
              {formatVideoTime(currentTime())} / {formatVideoTime(duration())}
            </span>
          </Show>
        </div>
      </Show>
    </div>
  );
};
