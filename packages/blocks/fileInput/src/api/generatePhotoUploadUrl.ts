import { ORPCError } from "@orpc/server";
import {
  maxPhotoFileSizeBytes,
  photoFileType,
} from "@typebot.io/blocks-inputs/photo/constants";
import type { PhotoInputBlock } from "@typebot.io/blocks-inputs/photo/schema";
import { resolveUploadFileType } from "@typebot.io/lib/s3/createUploadFilePath";
import { generateDirectAnswerUploadUrl } from "./generateDirectAnswerUploadUrl";

/** Upload URL of a photo answer: a JPEG of at most 5 MB, stored with the block visibility. */
export const generatePhotoUploadUrl = ({
  block,
  fileType,
  fileSize,
  typebotId,
  workspaceId,
  resultId,
  currentBlockId,
}: {
  block: PhotoInputBlock;
  fileType: string | undefined;
  fileSize: number | undefined;
  typebotId: string;
  workspaceId: string | undefined;
  resultId: string | undefined;
  currentBlockId: string;
}) => {
  const resolvedFileType = resolveUploadFileType(fileType);
  if (resolvedFileType !== photoFileType)
    throw new ORPCError("BAD_REQUEST", {
      message: `File type ${resolvedFileType} not allowed`,
    });
  if (!fileSize || fileSize <= 0)
    throw new ORPCError("BAD_REQUEST", { message: "Missing file size" });
  if (fileSize > maxPhotoFileSizeBytes)
    throw new ORPCError("BAD_REQUEST", {
      message: "File size exceeds the 5MB limit",
    });
  return generateDirectAnswerUploadUrl({
    visibility: block.options?.visibility === "Private" ? "Private" : "Public",
    fileType: resolvedFileType,
    fileSize,
    maxFileSizeMB: maxPhotoFileSizeBytes / 1024 / 1024,
    typebotId,
    workspaceId,
    resultId,
    currentBlockId,
  });
};
