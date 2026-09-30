import {
  detectVideoCodecs,
  type VideoCodecReport,
} from "@typebot.io/blocks-bubbles/video/media/detectVideoCodecs";

/** Enough for the codec boxes of "fast start" MP4s and WebM headers. */
const maxInspectedBytes = 2 * 1024 * 1024;

/**
 * Reads the beginning of a video (local file or link) and reports its real
 * container / codecs. Links are read with a Range request: servers without CORS
 * can't be inspected from the browser, which is reported as `undefined`.
 */
export const checkVideoCompatibility = async (
  source: File | string,
): Promise<VideoCodecReport | undefined> => {
  if (typeof source !== "string")
    return detectVideoCodecs(
      new Uint8Array(await source.slice(0, maxInspectedBytes).arrayBuffer()),
    );
  try {
    const response = await fetch(source, {
      headers: { Range: `bytes=0-${maxInspectedBytes - 1}` },
    });
    if (!response.ok) return;
    const bytes = new Uint8Array(await response.arrayBuffer());
    return detectVideoCodecs(bytes.slice(0, maxInspectedBytes));
  } catch {
    return;
  }
};
