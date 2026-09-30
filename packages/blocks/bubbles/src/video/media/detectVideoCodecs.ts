export type VideoContainer = "mp4" | "webm" | "unknown";

export type VideoCodecReport = {
  container: VideoContainer;
  videoCodecs: string[];
  audioCodecs: string[];
  /** Compatible with Chrome, Edge, Safari (macOS / iOS) and Chrome Android. */
  isWidelyCompatible: boolean;
  warnings: string[];
};

const mp4VideoCodecs: Record<string, string> = {
  avc1: "H.264",
  avc3: "H.264",
  hvc1: "HEVC",
  hev1: "HEVC",
  av01: "AV1",
  vp09: "VP9",
};
const mp4AudioCodecs: Record<string, string> = {
  mp4a: "AAC",
  Opus: "Opus",
  "ac-3": "AC-3",
  "ec-3": "E-AC-3",
};
const webmVideoCodecs: Record<string, string> = {
  V_VP8: "VP8",
  V_VP9: "VP9",
  V_AV1: "AV1",
};
const webmAudioCodecs: Record<string, string> = {
  A_OPUS: "Opus",
  A_VORBIS: "Vorbis",
};

/**
 * Detects the real container and codecs of a video from its first bytes (the
 * extension alone says nothing about the codecs). MP4: sample entry fourccs
 * (avc1, hvc1, av01, vp09, mp4a...). WebM: EBML header + Matroska codec ids.
 * The moov box of MP4s written by some tools sits at the end of the file: when no
 * codec is found in the first bytes, the report says so instead of guessing.
 */
export const detectVideoCodecs = (bytes: Uint8Array): VideoCodecReport => {
  const container = detectContainer(bytes);
  // The ftyp box lists "compatible brands" (e.g. avc1) that are not codecs.
  const text = latin1(
    container === "mp4" ? bytes.subarray(readFtypBoxSize(bytes)) : bytes,
  );
  const [videoTable, audioTable] =
    container === "webm"
      ? [webmVideoCodecs, webmAudioCodecs]
      : [mp4VideoCodecs, mp4AudioCodecs];
  const videoCodecs = findCodecs(text, videoTable);
  const audioCodecs = findCodecs(text, audioTable);

  const warnings: string[] = [];
  if (container === "unknown")
    warnings.push("Unknown format: use MP4 (H.264 video, AAC audio).");
  if (container !== "unknown" && videoCodecs.length === 0)
    warnings.push(
      "Codecs not found in the beginning of the file (metadata at the end): export it with 'fast start' / 'web optimized' to be sure.",
    );
  if (videoCodecs.includes("HEVC"))
    warnings.push(
      "HEVC (H.265) doesn't play on many Chrome, Edge and Android devices: export in H.264.",
    );
  if (videoCodecs.includes("AV1"))
    warnings.push(
      "AV1 doesn't play on older iPhones and Macs: export in H.264.",
    );
  if (container === "webm")
    warnings.push(
      "WebM isn't supported by older iPhones/iPads: provide an MP4 (H.264/AAC), keep WebM as fallback.",
    );
  if (audioCodecs.some((codec) => codec === "AC-3" || codec === "E-AC-3"))
    warnings.push("AC-3 audio isn't supported by Chrome: use AAC.");

  const isWidelyCompatible =
    container === "mp4" &&
    videoCodecs.length > 0 &&
    videoCodecs.every((codec) => codec === "H.264") &&
    audioCodecs.every((codec) => codec === "AAC");
  return { container, videoCodecs, audioCodecs, isWidelyCompatible, warnings };
};

const detectContainer = (bytes: Uint8Array): VideoContainer => {
  if (
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3
  )
    return "webm";
  if (latin1(bytes.subarray(4, 8)) === "ftyp") return "mp4";
  return "unknown";
};

const readFtypBoxSize = (bytes: Uint8Array) => {
  if (bytes.length < 8) return bytes.length;
  const size =
    ((bytes[0]! << 24) | (bytes[1]! << 16) | (bytes[2]! << 8) | bytes[3]!) >>>
    0;
  return Math.min(Math.max(size, 8), bytes.length);
};

const findCodecs = (text: string, table: Record<string, string>) => [
  ...new Set(
    Object.entries(table)
      .filter(([marker]) => text.includes(marker))
      .map(([, codec]) => codec),
  ),
];

const latin1 = (bytes: Uint8Array) => {
  let text = "";
  for (let index = 0; index < bytes.length; index++)
    text += String.fromCharCode(bytes[index]!);
  return text;
};
