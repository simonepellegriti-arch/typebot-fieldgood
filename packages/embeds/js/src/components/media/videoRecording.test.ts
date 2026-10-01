import { describe, expect, it } from "bun:test";
import { maxVideoClipUploadBytes } from "@typebot.io/blocks-inputs/text/videoClipConstants";
import { computeVideoRecordingBitrate } from "./computeVideoRecordingBitrate";
import { pickVideoRecordingFormat } from "./pickVideoRecordingFormat";

describe("pickVideoRecordingFormat", () => {
  it("prefers MP4 (Safari / iPhone, recent Chrome)", () => {
    expect(
      pickVideoRecordingFormat((mimeType) => mimeType.startsWith("video/mp4")),
    ).toEqual({ mimeType: "video/mp4;codecs=avc1,mp4a", extension: "mp4" });
  });

  it("falls back to WebM (Firefox, older Chrome)", () => {
    expect(
      pickVideoRecordingFormat((mimeType) => mimeType.startsWith("video/webm")),
    ).toEqual({ mimeType: "video/webm;codecs=vp9,opus", extension: "webm" });
  });

  it("returns nothing when the browser can't record video", () => {
    expect(pickVideoRecordingFormat(() => false)).toBeUndefined();
  });
});

describe("computeVideoRecordingBitrate", () => {
  it("keeps a clip of the maximum duration under the upload limit", () => {
    for (const maxDurationSeconds of [5, 30, 60, 90]) {
      const { videoBitsPerSecond, audioBitsPerSecond } =
        computeVideoRecordingBitrate(maxDurationSeconds);
      const expectedBytes =
        ((videoBitsPerSecond + audioBitsPerSecond) * maxDurationSeconds) / 8;
      expect(expectedBytes).toBeLessThan(maxVideoClipUploadBytes);
    }
  });

  it("gives short answers a better quality", () => {
    expect(computeVideoRecordingBitrate(20).videoBitsPerSecond).toBeGreaterThan(
      computeVideoRecordingBitrate(60).videoBitsPerSecond,
    );
  });
});
