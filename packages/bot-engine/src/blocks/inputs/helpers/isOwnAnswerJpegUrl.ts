import { env } from "@typebot.io/env";
import { parseS3PublicBaseUrl } from "@typebot.io/lib/s3/parseS3PublicBaseUrl";

/**
 * JPEG answers (signature, photo) are uploaded by the web client to our own
 * storage: only those links (public URL or private builder link) are accepted.
 */
export const isOwnAnswerJpegUrl = (url: string) => {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return false;
  }
  if (!/\.jpe?g$/i.test(parsedUrl.pathname)) return false;
  const allowedPrefixes = [
    parseS3PublicBaseUrl(),
    env.NEXTAUTH_URL ? `${env.NEXTAUTH_URL}/api/typebots/` : undefined,
  ].filter((prefix): prefix is string => Boolean(prefix));
  return allowedPrefixes.some((prefix) =>
    url.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`),
  );
};
