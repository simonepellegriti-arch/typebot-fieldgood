/** Tolerance for decoder jitter when comparing positions (seconds). */
export const seekToleranceSeconds = 1;

/**
 * When seeking is disabled, respondents may go back but never forward beyond the
 * furthest point they actually reached. Returns the position to restore, or
 * undefined when the requested position is allowed.
 */
export const resolveSeekTarget = ({
  requestedTime,
  maxReachedTime,
  allowSeeking,
}: {
  requestedTime: number;
  maxReachedTime: number;
  allowSeeking: boolean;
}): number | undefined => {
  if (allowSeeking) return;
  if (requestedTime <= maxReachedTime + seekToleranceSeconds) return;
  return maxReachedTime;
};
