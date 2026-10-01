export type VideoRecordingFormat = {
  mimeType: string;
  extension: "mp4" | "webm";
};

/**
 * Container / codecs used to record a video answer, in order of preference.
 * MP4 (H.264 + AAC) first: it plays everywhere, including Safari / iPhone
 * when the results are reviewed. Chrome < 126 and Firefox fall back to WebM.
 */
const candidateFormats: VideoRecordingFormat[] = [
  { mimeType: "video/mp4;codecs=avc1,mp4a", extension: "mp4" },
  { mimeType: "video/mp4", extension: "mp4" },
  { mimeType: "video/webm;codecs=vp9,opus", extension: "webm" },
  { mimeType: "video/webm;codecs=vp8,opus", extension: "webm" },
  { mimeType: "video/webm", extension: "webm" },
];

export const pickVideoRecordingFormat = (
  isTypeSupported: (mimeType: string) => boolean,
): VideoRecordingFormat | undefined =>
  candidateFormats.find((format) => isTypeSupported(format.mimeType));
