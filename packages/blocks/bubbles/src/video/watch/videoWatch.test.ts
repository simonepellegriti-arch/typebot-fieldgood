import { describe, expect, it } from "bun:test";
import { VideoBubbleContentType } from "../constants";
import { computeVideoWatchProgress } from "./computeVideoWatchProgress";
import { isVideoWatchRequirementMet } from "./isVideoWatchRequirementMet";
import { isVideoWatchTrackingActive } from "./isVideoWatchTrackingActive";
import { resolveSeekTarget } from "./resolveSeekTarget";

describe("computeVideoWatchProgress", () => {
  it("counts replayed portions only once", () => {
    expect(
      computeVideoWatchProgress({
        playedRanges: [
          { start: 0, end: 30 },
          { start: 10, end: 40 },
        ],
        durationSeconds: 100,
      }),
    ).toEqual({ watchedSeconds: 40, watchedPercentage: 40 });
  });

  it("ignores skipped portions (seeking is not watching)", () => {
    expect(
      computeVideoWatchProgress({
        playedRanges: [
          { start: 0, end: 10 },
          { start: 90, end: 100 },
        ],
        durationSeconds: 100,
      }),
    ).toEqual({ watchedSeconds: 20, watchedPercentage: 20 });
  });

  it("returns 0% while the duration is unknown", () => {
    expect(
      computeVideoWatchProgress({
        playedRanges: [{ start: 0, end: 5 }],
        durationSeconds: Number.NaN,
      }),
    ).toEqual({ watchedSeconds: 5, watchedPercentage: 0 });
  });
});

describe("resolveSeekTarget", () => {
  it("allows any position when seeking is enabled", () => {
    expect(
      resolveSeekTarget({
        requestedTime: 90,
        maxReachedTime: 10,
        allowSeeking: true,
      }),
    ).toBeUndefined();
  });

  it("blocks forward seeking beyond the furthest watched point", () => {
    expect(
      resolveSeekTarget({
        requestedTime: 90,
        maxReachedTime: 10,
        allowSeeking: false,
      }),
    ).toBe(10);
  });

  it("allows going back when seeking is disabled", () => {
    expect(
      resolveSeekTarget({
        requestedTime: 2,
        maxReachedTime: 10,
        allowSeeking: false,
      }),
    ).toBeUndefined();
  });
});

describe("watch requirement", () => {
  const tracking = { isRequired: true, minimumWatchPercentage: 80 };

  it("is met at the minimum percentage or at completion", () => {
    expect(
      isVideoWatchRequirementMet({
        tracking,
        watchedPercentage: 79.9,
        isCompleted: false,
      }),
    ).toBe(false);
    expect(
      isVideoWatchRequirementMet({
        tracking,
        watchedPercentage: 80,
        isCompleted: false,
      }),
    ).toBe(true);
    expect(
      isVideoWatchRequirementMet({
        tracking,
        watchedPercentage: 10,
        isCompleted: true,
      }),
    ).toBe(true);
  });

  it("is always met when viewing isn't required", () => {
    expect(
      isVideoWatchRequirementMet({
        tracking: { isRequired: false },
        watchedPercentage: 0,
        isCompleted: false,
      }),
    ).toBe(true);
  });

  it("only tracks native video files", () => {
    expect(
      isVideoWatchTrackingActive({
        type: VideoBubbleContentType.URL,
        url: "https://cdn.example.com/spot.mp4",
        watchTracking: { isEnabled: true },
      }),
    ).toBe(true);
    expect(
      isVideoWatchTrackingActive({
        type: VideoBubbleContentType.YOUTUBE,
        url: "https://youtu.be/abc",
        id: "abc",
        watchTracking: { isEnabled: true },
      }),
    ).toBe(false);
    // Existing video bubbles (no watchTracking) keep working as before.
    expect(
      isVideoWatchTrackingActive({
        type: VideoBubbleContentType.URL,
        url: "https://cdn.example.com/spot.mp4",
      }),
    ).toBe(false);
  });
});
