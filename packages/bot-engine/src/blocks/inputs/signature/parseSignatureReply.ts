import { defaultSignatureInputOptions } from "@typebot.io/blocks-inputs/signature/constants";
import type { SignatureInputBlock } from "@typebot.io/blocks-inputs/signature/schema";
import { env } from "@typebot.io/env";
import { parseS3PublicBaseUrl } from "@typebot.io/lib/s3/parseS3PublicBaseUrl";
import type { ParsedReply } from "../../../types";

/**
 * A signature reply is the URL of the JPEG uploaded by the web client. Only
 * JPEG files of our own storage (public URL or private builder link) are accepted.
 */
export const parseSignatureReply = (
  text: string | undefined,
  { block }: { block: SignatureInputBlock },
): ParsedReply => {
  if (text === undefined)
    return (block.options?.isRequired ??
      defaultSignatureInputOptions.isRequired)
      ? { status: "fail" }
      : { status: "skip" };
  const url = text.trim();
  if (!isOwnSignatureUrl(url)) return { status: "fail" };
  return {
    status: "success",
    content: url,
    structuredAnswer: { value: url, label: url },
  };
};

const isOwnSignatureUrl = (url: string) => {
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
