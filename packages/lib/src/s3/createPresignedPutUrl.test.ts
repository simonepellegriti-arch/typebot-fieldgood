import { describe, expect, it } from "bun:test";
import { createPresignedPutUrl } from "./createPresignedPutUrl";

const signedUpload = {
  endpoint: "account.r2.cloudflarestorage.com",
  useSSL: true,
  region: "auto",
  accessKey: "test-access-key",
  secretKey: "test-secret-key",
  bucket: "uploads",
  key: "public/workspaces/w/typebots/t/results/r/blocks/b/answer.mp4",
  contentType: "video/mp4",
  contentLength: 31_457_280,
  cacheControl: "public, max-age=86400",
  expiresInSeconds: 600,
  now: new Date("2026-10-01T10:00:00Z"),
};

describe("createPresignedPutUrl", () => {
  it("builds a path-style URL with signed type, size and cache headers", () => {
    const presignedUrl = new URL(createPresignedPutUrl(signedUpload));
    expect(presignedUrl.origin).toBe(
      "https://account.r2.cloudflarestorage.com",
    );
    expect(presignedUrl.pathname).toBe(
      `/${signedUpload.bucket}/${signedUpload.key}`,
    );
    expect(Object.fromEntries(presignedUrl.searchParams)).toMatchObject({
      "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
      "X-Amz-Credential": "test-access-key/20261001/auto/s3/aws4_request",
      "X-Amz-Date": "20261001T100000Z",
      "X-Amz-Expires": "600",
      "X-Amz-SignedHeaders": "cache-control;content-length;content-type;host",
    });
    expect(presignedUrl.searchParams.get("X-Amz-Signature")).toMatch(
      /^[0-9a-f]{64}$/,
    );
  });

  it("gives another signature for another size or type", () => {
    const signature = (overrides: Partial<typeof signedUpload>) =>
      new URL(
        createPresignedPutUrl({ ...signedUpload, ...overrides }),
      ).searchParams.get("X-Amz-Signature");
    expect(signature({})).not.toBe(signature({ contentLength: 1 }));
    expect(signature({})).not.toBe(signature({ contentType: "text/html" }));
  });
});
