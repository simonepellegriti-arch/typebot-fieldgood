import { maxVideoClipUploadBytes } from "@typebot.io/blocks-inputs/text/videoClipConstants";

const audioBitsPerSecond = 64_000;
const minVideoBitsPerSecond = 250_000;
const maxVideoBitsPerSecond = 1_500_000;
/** Containers and bitrate overshoot of some encoders. */
const safetyRatio = 0.8;

/**
 * Bitrates so that a clip of the maximum duration fits in the upload limit:
 * short answers get a better quality, long ones a lighter one.
 */
export const computeVideoRecordingBitrate = (maxDurationSeconds: number) => {
  const totalBitsPerSecond =
    (maxVideoClipUploadBytes * 8 * safetyRatio) /
    Math.max(1, maxDurationSeconds);
  const videoBitsPerSecond = Math.round(
    Math.min(
      maxVideoBitsPerSecond,
      Math.max(minVideoBitsPerSecond, totalBitsPerSecond - audioBitsPerSecond),
    ),
  );
  return { videoBitsPerSecond, audioBitsPerSecond };
};
