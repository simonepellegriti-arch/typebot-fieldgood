import { blockBaseSchema } from "@typebot.io/blocks-base/schemas";
import { singleVariableOrNumberSchema } from "@typebot.io/variables/schemas";
import { z } from "zod";
import { BubbleBlockType } from "../constants";
import { VideoBubbleContentType } from "./constants";

export const videoBubbleContentSchema = z.object({
  url: z.string().optional(),
  id: z.string().optional(),
  type: z.nativeEnum(VideoBubbleContentType).optional(),
  height: singleVariableOrNumberSchema.optional(),
  aspectRatio: z.string().optional(),
  maxWidth: z.string().optional(),
  queryParamsStr: z.string().optional(),
  areControlsDisplayed: z.boolean().optional(),
  isAutoplayEnabled: z.boolean().optional(),
  /** Native video files only. Autoplay with sound is usually blocked by browsers. */
  isMuted: z.boolean().optional(),
  isLooping: z.boolean().optional(),
  posterUrl: z.string().optional(),
  /**
   * Research tracking for native video files (MP4/WebM, uploaded or linked).
   * When enabled the flow waits on this bubble until the respondent continues,
   * and the viewing data is saved as the block answer.
   */
  watchTracking: z
    .object({
      isEnabled: z.boolean().optional(),
      /** Respondent can't continue before reaching minimumWatchPercentage. */
      isRequired: z.boolean().optional(),
      minimumWatchPercentage: z.number().min(0).max(100).optional(),
      allowSeeking: z.boolean().optional(),
      autoContinueOnEnd: z.boolean().optional(),
      /** Receives the watched percentage (0-100). Also names the export columns. */
      variableId: z.string().optional(),
      buttonLabel: z.string().optional(),
      requirementMessage: z.string().optional(),
    })
    .optional(),
});

export const videoWatchEventTypes = [
  "VIDEO_STARTED",
  "VIDEO_PAUSED",
  "VIDEO_COMPLETED",
] as const;

export const videoWatchEventSchema = z.object({
  type: z.enum(videoWatchEventTypes),
  /** Position in the video, in seconds. */
  positionSeconds: z.number().nonnegative(),
  /** ISO 8601 timestamp (client clock). */
  at: z.string(),
});

/**
 * What the respondent actually watched. watchedSeconds counts played portions of
 * the video only once (HTML5 `played` ranges), never the time spent on the page.
 */
export const videoWatchResultSchema = z.object({
  isStarted: z.boolean(),
  isCompleted: z.boolean(),
  watchedSeconds: z.number().nonnegative(),
  watchedPercentage: z.number().min(0).max(100),
  durationSeconds: z.number().nonnegative().nullable(),
  pauseCount: z.number().int().nonnegative(),
  events: z.array(videoWatchEventSchema).max(500),
});

export const videoStructuredReplySchema = z.object({
  type: z.literal("video"),
  result: videoWatchResultSchema,
});

export const videoBubbleBlockSchema = blockBaseSchema.merge(
  z.object({
    type: z.enum([BubbleBlockType.VIDEO]),
    content: videoBubbleContentSchema.optional(),
  }),
);

export type VideoBubbleBlock = z.infer<typeof videoBubbleBlockSchema>;
export type EmbeddableVideoBubbleContentType = Exclude<
  VideoBubbleContentType,
  VideoBubbleContentType.URL
>;
export type VideoWatchTracking = NonNullable<
  z.infer<typeof videoBubbleContentSchema>["watchTracking"]
>;
export type VideoWatchEvent = z.infer<typeof videoWatchEventSchema>;
export type VideoWatchResult = z.infer<typeof videoWatchResultSchema>;
export type VideoStructuredReply = z.infer<typeof videoStructuredReplySchema>;
