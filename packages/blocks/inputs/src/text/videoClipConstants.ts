/**
 * Video answers are uploaded through the bot's upload proxy, whose request body
 * is limited (4.5 MB on Vercel functions). The recorder adapts its bitrate to
 * the maximum duration so that a full-length clip stays under this size.
 */
export const minVideoClipDurationSeconds = 5;
export const maxVideoClipDurationSeconds = 90;
export const maxVideoClipUploadBytes = 4 * 1024 * 1024;
