import { describe, expect, it } from "bun:test";
import type { VideoWatchTracking } from "@typebot.io/blocks-bubbles/video/schema";
import {
  createVideoWatchTracker,
  type TrackedMedia,
} from "./createVideoWatchTracker";

/** Minimal HTMLVideoElement stand-in: playback appends to `played` ranges. */
const createFakeMedia = (duration: number) => {
  const ranges: { start: number; end: number }[] = [];
  const media: {
    currentTime: number;
    duration: number;
    seeking: boolean;
    ended: boolean;
    played: TrackedMedia["played"];
  } = {
    currentTime: 0,
    duration,
    seeking: false,
    ended: false,
    played: {
      get length() {
        return ranges.length;
      },
      start: (index: number) => ranges[index]!.start,
      end: (index: number) => ranges[index]!.end,
    },
  };
  const playUntil = (time: number) => {
    ranges.push({ start: media.currentTime, end: time });
    media.currentTime = time;
  };
  const seekTo = (time: number) => {
    media.seeking = true;
    media.currentTime = time;
  };
  const endSeek = () => {
    media.seeking = false;
  };
  return { media, playUntil, seekTo, endSeek };
};

const fixedNow = () => new Date("2026-09-30T10:00:00.000Z");

const setup = (tracking: VideoWatchTracking, onEnded?: () => void) => {
  const tracker = createVideoWatchTracker({
    tracking: () => tracking,
    onEnded,
    now: fixedNow,
  });
  return { tracker, ...createFakeMedia(100) };
};

describe("video watch tracker", () => {
  it("records start, pauses and watched seconds from played ranges", () => {
    const { tracker, media, playUntil } = setup({ isEnabled: true });
    tracker.handlePlay(media);
    playUntil(25);
    tracker.handleTimeUpdate(media);
    tracker.handlePause(media);
    tracker.handlePlay(media);
    playUntil(50);
    tracker.handleTimeUpdate(media);

    const result = tracker.getResult();
    expect(result).toMatchObject({
      isStarted: true,
      isCompleted: false,
      watchedSeconds: 50,
      watchedPercentage: 50,
      durationSeconds: 100,
      pauseCount: 1,
    });
    expect(result.events.map((event) => event.type)).toEqual([
      "VIDEO_STARTED",
      "VIDEO_PAUSED",
    ]);
    expect(result.events[1]).toEqual({
      type: "VIDEO_PAUSED",
      positionSeconds: 25,
      at: "2026-09-30T10:00:00.000Z",
    });
  });

  it("detects completion and doesn't count the pause fired at the end", () => {
    let hasEnded = false;
    const { tracker, media, playUntil } = setup({ isEnabled: true }, () => {
      hasEnded = true;
    });
    tracker.handlePlay(media);
    playUntil(100);
    media.ended = true;
    tracker.handlePause(media);
    tracker.handleEnded(media);
    const result = tracker.getResult();
    expect(result.isCompleted).toBe(true);
    expect(result.pauseCount).toBe(0);
    expect(result.events.at(-1)?.type).toBe("VIDEO_COMPLETED");
    expect(hasEnded).toBe(true);
  });

  it("enables continuing only after the minimum watch percentage", () => {
    const { tracker, media, playUntil } = setup({
      isEnabled: true,
      isRequired: true,
      minimumWatchPercentage: 80,
    });
    tracker.handlePlay(media);
    playUntil(79);
    tracker.handleTimeUpdate(media);
    expect(tracker.isRequirementMet()).toBe(false);
    playUntil(80);
    tracker.handleTimeUpdate(media);
    expect(tracker.isRequirementMet()).toBe(true);
  });

  it("lets respondents seek freely when seeking is allowed", () => {
    const { tracker, media, playUntil, seekTo } = setup({
      isEnabled: true,
      allowSeeking: true,
    });
    tracker.handlePlay(media);
    playUntil(10);
    tracker.handleTimeUpdate(media);
    seekTo(90);
    tracker.handleSeeking(media);
    expect(media.currentTime).toBe(90);
    // Skipped part is not counted as watched.
    expect(tracker.getResult().watchedSeconds).toBe(10);
  });

  it("brings respondents back when they skip ahead with seeking disabled", () => {
    const { tracker, media, playUntil, seekTo, endSeek } = setup({
      isEnabled: true,
      allowSeeking: false,
    });
    tracker.handlePlay(media);
    playUntil(30);
    tracker.handleTimeUpdate(media);
    seekTo(95);
    tracker.handleSeeking(media);
    expect(media.currentTime).toBe(30);
    endSeek();
    // Going back is allowed.
    seekTo(5);
    tracker.handleSeeking(media);
    expect(media.currentTime).toBe(5);
  });

  it("calls onEnded so the bubble can continue automatically", () => {
    const calls: string[] = [];
    const { tracker, media, playUntil } = setup(
      { isEnabled: true, autoContinueOnEnd: true },
      () => calls.push("ended"),
    );
    tracker.handlePlay(media);
    playUntil(100);
    media.ended = true;
    tracker.handleEnded(media);
    expect(calls).toEqual(["ended"]);
  });
});
