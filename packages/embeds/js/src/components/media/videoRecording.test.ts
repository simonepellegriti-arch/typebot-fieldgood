import { describe, expect, it } from "bun:test";
import { checkMediaAnswerFile } from "./checkMediaAnswerFile";
import { computeVideoRecordingBitrate } from "./computeVideoRecordingBitrate";
import { pickVideoRecordingFormat } from "./pickVideoRecordingFormat";
import { withInferredMediaFileType } from "./withInferredMediaFileType";

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
  it("keeps a clip of the maximum duration under the size limit", () => {
    for (const maxFileSizeMB of [20, 50, 200])
      for (const maxDurationSeconds of [5, 30, 60, 90, 300]) {
        const maxFileSizeBytes = maxFileSizeMB * 1024 * 1024;
        const { videoBitsPerSecond, audioBitsPerSecond } =
          computeVideoRecordingBitrate({
            maxDurationSeconds,
            maxFileSizeBytes,
          });
        const expectedBytes =
          ((videoBitsPerSecond + audioBitsPerSecond) * maxDurationSeconds) / 8;
        expect(expectedBytes).toBeLessThan(maxFileSizeBytes);
      }
  });

  it("gives short answers a better quality", () => {
    const maxFileSizeBytes = 50 * 1024 * 1024;
    expect(
      computeVideoRecordingBitrate({
        maxDurationSeconds: 180,
        maxFileSizeBytes,
      }).videoBitsPerSecond,
    ).toBeLessThan(
      computeVideoRecordingBitrate({
        maxDurationSeconds: 300,
        maxFileSizeBytes: 200 * 1024 * 1024,
      }).videoBitsPerSecond,
    );
    expect(
      computeVideoRecordingBitrate({
        maxDurationSeconds: 300,
        maxFileSizeBytes,
      }).videoBitsPerSecond,
    ).toBeLessThan(
      computeVideoRecordingBitrate({
        maxDurationSeconds: 200,
        maxFileSizeBytes,
      }).videoBitsPerSecond,
    );
  });

  it("caps the quality of short answers", () => {
    expect(
      computeVideoRecordingBitrate({
        maxDurationSeconds: 5,
        maxFileSizeBytes: 200 * 1024 * 1024,
      }).videoBitsPerSecond,
    ).toBe(2_500_000);
  });
});

describe("checkMediaAnswerFile", () => {
  const createFile = (type: string, sizeBytes: number) =>
    new File([new Uint8Array(sizeBytes)], "answer", { type });

  it("accepts a video under the size limit", () => {
    expect(
      checkMediaAnswerFile({
        file: createFile("video/quicktime", 1024),
        kind: "video",
        maxFileSizeMB: 1,
      }),
    ).toBeUndefined();
  });

  it("accepts audio files and audio-only MP4 / WebM", () => {
    for (const type of ["audio/mpeg", "audio/x-m4a", "video/mp4", "video/webm"])
      expect(
        checkMediaAnswerFile({
          file: createFile(type, 10),
          kind: "audio",
          maxFileSizeMB: 1,
        }),
      ).toBeUndefined();
  });

  it("refuses other file types", () => {
    expect(
      checkMediaAnswerFile({
        file: createFile("image/png", 10),
        kind: "video",
        maxFileSizeMB: 1,
      }),
    ).toBe("wrongType");
    expect(
      checkMediaAnswerFile({
        file: createFile("video/quicktime", 10),
        kind: "audio",
        maxFileSizeMB: 1,
      }),
    ).toBe("wrongType");
  });

  it("refuses files over the size limit", () => {
    expect(
      checkMediaAnswerFile({
        file: createFile("video/mp4", 1024 * 1024 + 1),
        kind: "video",
        maxFileSizeMB: 1,
      }),
    ).toBe("tooLarge");
  });
});

describe("withInferredMediaFileType", () => {
  it("infers the type of files picked without MIME type", () => {
    expect(
      withInferredMediaFileType(new File(["x"], "memo.M4A", { type: "" })).type,
    ).toBe("audio/mp4");
    expect(
      withInferredMediaFileType(new File(["x"], "clip.mov", { type: "" })).type,
    ).toBe("video/quicktime");
  });

  it("keeps the type given by the browser", () => {
    const file = new File(["x"], "clip.mov", { type: "video/mp4" });
    expect(withInferredMediaFileType(file)).toBe(file);
  });
});
