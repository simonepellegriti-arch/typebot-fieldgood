import { defaultVideoWatchTracking } from "@typebot.io/blocks-bubbles/video/constants";
import type {
  VideoWatchEvent,
  VideoWatchResult,
  VideoWatchTracking,
} from "@typebot.io/blocks-bubbles/video/schema";
import { computeVideoWatchProgress } from "@typebot.io/blocks-bubbles/video/watch/computeVideoWatchProgress";
import { isVideoWatchRequirementMet } from "@typebot.io/blocks-bubbles/video/watch/isVideoWatchRequirementMet";
import { resolveSeekTarget } from "@typebot.io/blocks-bubbles/video/watch/resolveSeekTarget";
import { createSignal } from "solid-js";
import type { VideoResumeState } from "../../../../../components/media/createVideoResumeStore";

/** The subset of HTMLVideoElement the tracker reads (and writes, for seeking). */
export type TrackedMedia = {
  currentTime: number;
  readonly duration: number;
  readonly seeking: boolean;
  readonly ended: boolean;
  readonly played: {
    readonly length: number;
    start: (index: number) => number;
    end: (index: number) => number;
  };
};

const maxRecordedEvents = 500;
/** Loops never fire `ended`: a video played almost entirely counts as completed. */
const completionPercentage = 99;

/**
 * Tracks what a respondent really watched, from HTML5 media events:
 * watched seconds come from `played` ranges (not from time on page), pauses are
 * counted, completion is detected and forward seeking can be blocked.
 */
export const createVideoWatchTracker = ({
  tracking,
  onEnded,
  now = () => new Date(),
  initialState,
}: {
  tracking: () => VideoWatchTracking | undefined;
  onEnded?: () => void;
  now?: () => Date;
  /** Resumed viewing (the respondent came back to this video). */
  initialState?: VideoResumeState;
}) => {
  const [progress, setProgress] = createSignal({
    watchedSeconds: initialState?.watchedSeconds ?? 0,
    watchedPercentage: initialState?.watchedPercentage ?? 0,
  });
  const [isCompleted, setIsCompleted] = createSignal(
    initialState?.isCompleted ?? false,
  );
  let isStarted = initialState?.isStarted ?? false;
  let pauseCount = initialState?.pauseCount ?? 0;
  let maxReachedTime = initialState?.maxReachedTime ?? 0;
  let durationSeconds: number | null = null;
  const events: VideoWatchEvent[] = [];

  const recordEvent = (
    type: VideoWatchEvent["type"],
    media: Pick<TrackedMedia, "currentTime">,
  ) => {
    if (events.length >= maxRecordedEvents) return;
    events.push({
      type,
      positionSeconds: Math.round(media.currentTime * 10) / 10,
      at: now().toISOString(),
    });
  };

  const markCompleted = (media: TrackedMedia) => {
    if (isCompleted()) return;
    setIsCompleted(true);
    recordEvent("VIDEO_COMPLETED", media);
  };

  const updateProgress = (media: TrackedMedia) => {
    if (Number.isFinite(media.duration) && media.duration > 0)
      durationSeconds = media.duration;
    const playedRanges = Array.from(
      { length: media.played.length },
      (_, i) => ({
        start: media.played.start(i),
        end: media.played.end(i),
      }),
    );
    const playedProgress = computeVideoWatchProgress({
      playedRanges,
      durationSeconds,
    });
    // After a resume the new "played" ranges start empty: keep the best known progress.
    const newProgress = {
      watchedSeconds: Math.max(
        playedProgress.watchedSeconds,
        initialState?.watchedSeconds ?? 0,
      ),
      watchedPercentage: Math.max(
        playedProgress.watchedPercentage,
        initialState?.watchedPercentage ?? 0,
      ),
    };
    setProgress(newProgress);
    if (newProgress.watchedPercentage >= completionPercentage)
      markCompleted(media);
  };

  return {
    progress,
    isCompleted,
    handlePlay: (media: TrackedMedia) => {
      if (isStarted) return;
      isStarted = true;
      recordEvent("VIDEO_STARTED", media);
    },
    handlePause: (media: TrackedMedia) => {
      // Browsers fire `pause` right before `ended` and while seeking.
      if (media.ended || media.seeking) return;
      pauseCount++;
      recordEvent("VIDEO_PAUSED", media);
    },
    handleTimeUpdate: (media: TrackedMedia) => {
      if (!media.seeking)
        maxReachedTime = Math.max(maxReachedTime, media.currentTime);
      updateProgress(media);
    },
    handleSeeking: (media: TrackedMedia) => {
      const allowedTime = resolveSeekTarget({
        requestedTime: media.currentTime,
        maxReachedTime,
        allowSeeking:
          tracking()?.allowSeeking ?? defaultVideoWatchTracking.allowSeeking,
      });
      if (allowedTime !== undefined) media.currentTime = allowedTime;
    },
    handleEnded: (media: TrackedMedia) => {
      maxReachedTime = Math.max(maxReachedTime, media.currentTime);
      updateProgress(media);
      markCompleted(media);
      onEnded?.();
    },
    isRequirementMet: () =>
      isVideoWatchRequirementMet({
        tracking: tracking(),
        watchedPercentage: progress().watchedPercentage,
        isCompleted: isCompleted(),
      }),
    getResumeState: (
      media: Pick<TrackedMedia, "currentTime">,
    ): VideoResumeState => ({
      currentTime: media.currentTime,
      maxReachedTime,
      watchedSeconds: progress().watchedSeconds,
      watchedPercentage: progress().watchedPercentage,
      isCompleted: isCompleted(),
      isStarted,
      pauseCount,
    }),
    getResult: (): VideoWatchResult => ({
      isStarted,
      isCompleted: isCompleted(),
      watchedSeconds: progress().watchedSeconds,
      watchedPercentage: progress().watchedPercentage,
      durationSeconds:
        durationSeconds !== null ? Math.round(durationSeconds * 10) / 10 : null,
      pauseCount,
      events: [...events],
    }),
  };
};
