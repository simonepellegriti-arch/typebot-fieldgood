import { env } from "@typebot.io/env";
import { createPresignedPutUrl } from "./createPresignedPutUrl";
import { parseS3PublicBaseUrl } from "./parseS3PublicBaseUrl";

const uploadUrlExpiresInSeconds = 10 * 60;
export const directUploadCacheControl = "public, max-age=86400";

/**
 * Signed URL to PUT one file straight into the bucket (no proxy): used for
 * voice / video answers, which can be larger than a serverless request body.
 * Type and size are signed. The bucket needs a CORS rule allowing PUT with the
 * content-type and cache-control headers from the bots' origins.
 */
export const generatePresignedPutUrl = ({
  filePath,
  contentType,
  contentLength,
}: {
  filePath: string;
  contentType: string;
  contentLength: number;
}) => {
  if (!env.S3_ENDPOINT || !env.S3_ACCESS_KEY || !env.S3_SECRET_KEY)
    throw new Error("S3 not properly configured");
  return {
    presignedUrl: createPresignedPutUrl({
      endpoint: env.S3_ENDPOINT,
      port: env.S3_PORT,
      useSSL: env.S3_SSL,
      region: env.S3_REGION ?? "us-east-1",
      accessKey: env.S3_ACCESS_KEY,
      secretKey: env.S3_SECRET_KEY,
      bucket: env.S3_BUCKET,
      key: filePath,
      contentType,
      contentLength,
      cacheControl: directUploadCacheControl,
      expiresInSeconds: uploadUrlExpiresInSeconds,
    }),
    publicFileUrl: `${parseS3PublicBaseUrl()}/${filePath}`,
  };
};
