const audioBitsPerSecond = 64_000;
const minVideoBitsPerSecond = 250_000;
/** Good quality for a 640x480 face-to-camera answer. */
const maxVideoBitsPerSecond = 2_500_000;
/** Containers and bitrate overshoot of some encoders. */
const safetyRatio = 0.8;

/**
 * Bitrates so that a clip of the maximum duration fits in the size limit:
 * short answers get a better quality, long ones a lighter one.
 */
export const computeVideoRecordingBitrate = ({
  maxDurationSeconds,
  maxFileSizeBytes,
}: {
  maxDurationSeconds: number;
  maxFileSizeBytes: number;
}) => {
  const totalBitsPerSecond =
    (maxFileSizeBytes * 8 * safetyRatio) / Math.max(1, maxDurationSeconds);
  const videoBitsPerSecond = Math.round(
    Math.min(
      maxVideoBitsPerSecond,
      Math.max(minVideoBitsPerSecond, totalBitsPerSecond - audioBitsPerSecond),
    ),
  );
  return { videoBitsPerSecond, audioBitsPerSecond };
};
