/** 75.4 → "1:15". Unknown durations (NaN, Infinity for live streams) → "". */
export const formatVideoTime = (seconds: number | undefined): string => {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds < 0)
    return "";
  const roundedSeconds = Math.floor(seconds);
  const minutes = Math.floor(roundedSeconds / 60);
  const remainingSeconds = roundedSeconds % 60;
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
};
