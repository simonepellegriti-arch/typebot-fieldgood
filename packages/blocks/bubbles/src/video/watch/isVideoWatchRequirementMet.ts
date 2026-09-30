import { defaultVideoWatchTracking } from "../constants";
import type { VideoWatchTracking } from "../schema";

export const isVideoWatchRequirementMet = ({
  tracking,
  watchedPercentage,
  isCompleted,
}: {
  tracking: VideoWatchTracking | undefined;
  watchedPercentage: number;
  isCompleted: boolean;
}): boolean => {
  if (!(tracking?.isRequired ?? defaultVideoWatchTracking.isRequired))
    return true;
  if (isCompleted) return true;
  const minimumWatchPercentage =
    tracking?.minimumWatchPercentage ??
    defaultVideoWatchTracking.minimumWatchPercentage;
  return watchedPercentage >= minimumWatchPercentage;
};
