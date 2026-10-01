import { describe, expect, it } from "bun:test";
import { readIsoMediaDurationSeconds } from "./readIsoMediaDurationSeconds";

describe("readIsoMediaDurationSeconds", () => {
  it("reads the duration when the moov box is after the media data", async () => {
    const file = new Blob([
      box("ftyp", new Uint8Array(8)),
      box("mdat", new Uint8Array(1000)),
      box("moov", box("mvhd", mvhdV0({ timescale: 600, duration: 600 * 42 }))),
    ]);
    expect(await readIsoMediaDurationSeconds(file)).toBe(42);
  });

  it("reads version 1 headers and 64-bit box sizes", async () => {
    const file = new Blob([
      box("ftyp", new Uint8Array(8)),
      largeBox("mdat", new Uint8Array(100)),
      box(
        "moov",
        new Uint8Array([
          ...box("udta", new Uint8Array(4)),
          ...box("mvhd", mvhdV1({ timescale: 1000, duration: 95_500 })),
        ]),
      ),
    ]);
    expect(await readIsoMediaDurationSeconds(file)).toBe(95.5);
  });

  it("returns nothing for other files", async () => {
    expect(
      await readIsoMediaDurationSeconds(new Blob(["\x1aE\xdf\xa3 webm"])),
    ).toBeUndefined();
    expect(await readIsoMediaDurationSeconds(new Blob([]))).toBeUndefined();
  });
});

const box = (type: string, content: Uint8Array) => {
  const bytes = new Uint8Array(8 + content.length);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, bytes.length);
  for (let index = 0; index < 4; index++)
    bytes[4 + index] = type.charCodeAt(index);
  bytes.set(content, 8);
  return bytes;
};

const largeBox = (type: string, content: Uint8Array) => {
  const bytes = new Uint8Array(16 + content.length);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 1);
  for (let index = 0; index < 4; index++)
    bytes[4 + index] = type.charCodeAt(index);
  view.setBigUint64(8, BigInt(bytes.length));
  bytes.set(content, 16);
  return bytes;
};

const mvhdV0 = ({
  timescale,
  duration,
}: {
  timescale: number;
  duration: number;
}) => {
  const bytes = new Uint8Array(100);
  const view = new DataView(bytes.buffer);
  view.setUint32(12, timescale);
  view.setUint32(16, duration);
  return bytes;
};

const mvhdV1 = ({
  timescale,
  duration,
}: {
  timescale: number;
  duration: number;
}) => {
  const bytes = new Uint8Array(112);
  const view = new DataView(bytes.buffer);
  view.setUint8(0, 1);
  view.setUint32(20, timescale);
  view.setBigUint64(24, BigInt(duration));
  return bytes;
};
