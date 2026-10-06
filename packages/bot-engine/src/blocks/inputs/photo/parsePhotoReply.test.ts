import { describe, expect, it } from "bun:test";
import { InputBlockType } from "@typebot.io/blocks-inputs/constants";
import type { PhotoInputBlock } from "@typebot.io/blocks-inputs/photo/schema";
import { parseS3PublicBaseUrl } from "@typebot.io/lib/s3/parseS3PublicBaseUrl";
import { parsePhotoReply } from "./parsePhotoReply";

// Photos must live in our storage, whatever its configuration in tests.
const storageBaseUrl = parseS3PublicBaseUrl().replace(/\/$/, "");
const photoUrl = (name: string) =>
  `${storageBaseUrl}/public/workspaces/w/typebots/t/results/r/blocks/photo/${name}.jpeg`;

const buildBlock = (
  options: PhotoInputBlock["options"] = {},
): PhotoInputBlock => ({ id: "photo", type: InputBlockType.PHOTO, options });

describe("parsePhotoReply", () => {
  it("stores one photo link", () => {
    expect(parsePhotoReply(photoUrl("a"), { block: buildBlock() })).toEqual({
      status: "success",
      content: photoUrl("a"),
      structuredAnswer: { value: photoUrl("a"), label: photoUrl("a") },
    });
  });

  it("stores several photos up to the maximum, without duplicates", () => {
    const block = buildBlock({ maxPhotos: 3 });
    const reply = parsePhotoReply(
      `${photoUrl("a")}, ${photoUrl("b")},${photoUrl("a")}`,
      { block },
    );
    expect(reply).toMatchObject({
      status: "success",
      content: `${photoUrl("a")}, ${photoUrl("b")}`,
    });
    expect(
      parsePhotoReply(
        [photoUrl("a"), photoUrl("b"), photoUrl("c"), photoUrl("d")].join(", "),
        { block },
      ).status,
    ).toBe("fail");
    expect(
      parsePhotoReply(`${photoUrl("a")}, ${photoUrl("b")}`, {
        block: buildBlock(),
      }).status,
    ).toBe("fail");
  });

  it("refuses links that aren't JPEGs of our storage", () => {
    const block = buildBlock({ maxPhotos: 2 });
    expect(
      parsePhotoReply("https://evil.example.com/photo.jpg", { block }).status,
    ).toBe("fail");
    expect(
      parsePhotoReply(photoUrl("a").replace(".jpeg", ".png"), { block }).status,
    ).toBe("fail");
    expect(parsePhotoReply("una foto", { block }).status).toBe("fail");
  });

  it("can be skipped only when not required", () => {
    expect(parsePhotoReply(undefined, { block: buildBlock() }).status).toBe(
      "fail",
    );
    expect(
      parsePhotoReply(undefined, { block: buildBlock({ isRequired: false }) })
        .status,
    ).toBe("skip");
  });
});
