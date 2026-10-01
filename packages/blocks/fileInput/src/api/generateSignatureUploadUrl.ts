import { ORPCError } from "@orpc/server";
import {
  maxSignatureFileSizeBytes,
  signatureFileType,
} from "@typebot.io/blocks-inputs/signature/constants";
import type { SignatureInputBlock } from "@typebot.io/blocks-inputs/signature/schema";
import { resolveUploadFileType } from "@typebot.io/lib/s3/createUploadFilePath";
import { generateDirectAnswerUploadUrl } from "./generateDirectAnswerUploadUrl";

/** Upload URL of a signature: a JPEG of at most 2 MB, stored with the block visibility. */
export const generateSignatureUploadUrl = ({
  block,
  fileType,
  fileSize,
  typebotId,
  workspaceId,
  resultId,
  currentBlockId,
}: {
  block: SignatureInputBlock;
  fileType: string | undefined;
  fileSize: number | undefined;
  typebotId: string;
  workspaceId: string | undefined;
  resultId: string | undefined;
  currentBlockId: string;
}) => {
  const resolvedFileType = resolveUploadFileType(fileType);
  if (resolvedFileType !== signatureFileType)
    throw new ORPCError("BAD_REQUEST", {
      message: `File type ${resolvedFileType} not allowed`,
    });
  if (!fileSize || fileSize <= 0)
    throw new ORPCError("BAD_REQUEST", { message: "Missing file size" });
  if (fileSize > maxSignatureFileSizeBytes)
    throw new ORPCError("BAD_REQUEST", {
      message: "File size exceeds the 2MB limit",
    });
  return generateDirectAnswerUploadUrl({
    visibility: block.options?.visibility === "Private" ? "Private" : "Public",
    fileType: resolvedFileType,
    fileSize,
    maxFileSizeMB: maxSignatureFileSizeBytes / 1024 / 1024,
    typebotId,
    workspaceId,
    resultId,
    currentBlockId,
  });
};
