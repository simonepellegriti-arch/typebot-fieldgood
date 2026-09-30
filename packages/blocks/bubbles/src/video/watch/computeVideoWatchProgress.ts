/**
 * Computes the unique watched time from HTML5 `played` ranges (portions actually played,
 * seeked-over portions excluded) and the matching percentage of the video duration.
 */
export const computeVideoWatchProgress = ({
  playedRanges,
  durationSeconds,
}: {
  playedRanges: { start: number; end: number }[];
  durationSeconds: number | null | undefined;
}): { watchedSeconds: number; watchedPercentage: number } => {
  const sortedRanges = playedRanges
    .filter((range) => range.end > range.start)
    .map((range) => ({
      start: Math.max(0, range.start),
      end: durationSeconds ? Math.min(range.end, durationSeconds) : range.end,
    }))
    .sort((a, b) => a.start - b.start);

  let watchedSeconds = 0;
  let currentEnd = -1;
  for (const range of sortedRanges) {
    const start = Math.max(range.start, currentEnd);
    if (range.end > start) watchedSeconds += range.end - start;
    currentEnd = Math.max(currentEnd, range.end);
  }

  const roundedSeconds = Math.round(watchedSeconds * 10) / 10;
  if (!durationSeconds || !Number.isFinite(durationSeconds))
    return { watchedSeconds: roundedSeconds, watchedPercentage: 0 };
  const watchedPercentage = Math.min(
    100,
    Math.round((watchedSeconds / durationSeconds) * 1000) / 10,
  );
  return { watchedSeconds: roundedSeconds, watchedPercentage };
};
