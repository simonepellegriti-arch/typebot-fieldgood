import { defaultSignatureInputOptions } from "@typebot.io/blocks-inputs/signature/constants";
import type { SignatureInputBlock } from "@typebot.io/blocks-inputs/signature/schema";
import type { ParsedReply } from "../../../types";
import { isOwnAnswerJpegUrl } from "../helpers/isOwnAnswerJpegUrl";

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
  if (!isOwnAnswerJpegUrl(url)) return { status: "fail" };
  return {
    status: "success",
    content: url,
    structuredAnswer: { value: url, label: url },
  };
};
