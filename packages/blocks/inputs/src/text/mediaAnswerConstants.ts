/**
 * Voice / video answers of open questions (recorded or uploaded files).
 * They are uploaded straight to the storage with a short-lived signed URL, so
 * their size isn't limited by the serverless functions' request body.
 */
export const minVideoClipDurationSeconds = 5;
export const maxVideoClipDurationSeconds = 300;
export const minMediaAnswerFileSizeMB = 1;
export const maxMediaAnswerFileSizeMB = 200;

/** What an upload is for: tells the server which settings (limits, visibility) apply. */
export const mediaAnswerUploadPurposes = ["audioClip", "videoClip"] as const;
export type MediaAnswerUploadPurpose =
  (typeof mediaAnswerUploadPurposes)[number];
