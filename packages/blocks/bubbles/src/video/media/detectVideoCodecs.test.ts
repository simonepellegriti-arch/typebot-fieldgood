import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { detectVideoCodecs } from "./detectVideoCodecs";
import { getVideoMimeType } from "./getVideoMimeType";

// Half-second clips encoded with ffmpeg (64x64).
const readFixture = (name: string) =>
  new Uint8Array(readFileSync(join(import.meta.dir, "fixtures", name)));

describe("detectVideoCodecs", () => {
  it("accepts MP4 H.264 + AAC as compatible everywhere", () => {
    expect(detectVideoCodecs(readFixture("h264-aac.mp4"))).toEqual({
      container: "mp4",
      videoCodecs: ["H.264"],
      audioCodecs: ["AAC"],
      isWidelyCompatible: true,
      warnings: [],
    });
  });

  it("warns about HEVC", () => {
    const report = detectVideoCodecs(readFixture("hevc.mp4"));
    expect(report).toMatchObject({
      container: "mp4",
      videoCodecs: ["HEVC"],
      isWidelyCompatible: false,
    });
    expect(report.warnings.join(" ")).toContain("H.264");
  });

  it("recognizes WebM VP9 + Opus and recommends an MP4 first", () => {
    const report = detectVideoCodecs(readFixture("vp9-opus.webm"));
    expect(report).toMatchObject({
      container: "webm",
      videoCodecs: ["VP9"],
      audioCodecs: ["Opus"],
      isWidelyCompatible: false,
    });
    expect(report.warnings.join(" ")).toContain("MP4");
  });

  it("says so when the codecs aren't in the first bytes (moov at the end)", () => {
    const report = detectVideoCodecs(readFixture("h264-aac.mp4").slice(0, 32));
    expect(report.container).toBe("mp4");
    expect(report.isWidelyCompatible).toBe(false);
    expect(report.warnings.join(" ")).toContain("fast start");
  });

  it("flags unknown formats", () => {
    expect(
      detectVideoCodecs(new TextEncoder().encode("<html>not a video</html>")),
    ).toMatchObject({ container: "unknown", isWidelyCompatible: false });
  });
});

describe("getVideoMimeType", () => {
  it("announces the MIME type from the extension, ignoring query strings", () => {
    expect(getVideoMimeType("https://cdn.example.com/a.mp4?v=2")).toBe(
      "video/mp4",
    );
    expect(getVideoMimeType("https://cdn.example.com/a.WEBM#t=3")).toBe(
      "video/webm",
    );
    expect(getVideoMimeType("https://cdn.example.com/video")).toBeUndefined();
    expect(getVideoMimeType(undefined)).toBeUndefined();
  });
});
