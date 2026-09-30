import { VideoBubbleContentType } from "../constants";
import type { VideoBubbleBlock } from "../schema";

/**
 * Tracking only applies to native video files: external players (YouTube, Vimeo...)
 * don't expose reliable playback data without their own SDKs.
 */
export const isVideoWatchTrackingActive = (
  content: VideoBubbleBlock["content"],
): boolean =>
  content?.type === VideoBubbleContentType.URL &&
  Boolean(content.url) &&
  Boolean(content.watchTracking?.isEnabled);
