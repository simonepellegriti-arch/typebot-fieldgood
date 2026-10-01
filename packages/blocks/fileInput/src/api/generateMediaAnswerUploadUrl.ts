import { ORPCError } from "@orpc/server";
import { defaultTextInputOptions } from "@typebot.io/blocks-inputs/text/constants";
import type { MediaAnswerUploadPurpose } from "@typebot.io/blocks-inputs/text/mediaAnswerConstants";
import type { TextInputBlock } from "@typebot.io/blocks-inputs/text/schema";
import { env } from "@typebot.io/env";
import {
  createUploadFileName,
  parseUploadPathSegment,
  resolveUploadFileType,
} from "@typebot.io/lib/s3/createUploadFilePath";
import { generatePresignedPutUrl } from "@typebot.io/lib/s3/generatePresignedPutUrl";

type Props = {
  purpose: MediaAnswerUploadPurpose;
  block: TextInputBlock;
  fileType: string | undefined;
  fileSize: number | undefined;
  typebotId: string;
  workspaceId: string | undefined;
  resultId: string | undefined;
  currentBlockId: string;
};

/**
 * Upload URL for a voice / video answer of an open question (recorded in the
 * bot or picked from the device). The file goes straight to the storage with
 * a signed PUT whose type and size are the ones checked here.
 */
export const generateMediaAnswerUploadUrl = ({
  purpose,
  block,
  fileType,
  fileSize,
  typebotId,
  workspaceId,
  resultId,
  currentBlockId,
}: Props) => {
  const mediaOptions = block.options?.[purpose];
  if (!mediaOptions?.isEnabled)
    throw new ORPCError("BAD_REQUEST", {
      message: "Current block does not expect this kind of answer",
    });

  const resolvedFileType = resolveUploadFileType(fileType);
  if (!isAcceptedMediaType(purpose, resolvedFileType))
    throw new ORPCError("BAD_REQUEST", {
      message: `File type ${resolvedFileType} not allowed`,
    });

  if (!fileSize || fileSize <= 0)
    throw new ORPCError("BAD_REQUEST", { message: "Missing file size" });
  const maxFileSizeMB =
    mediaOptions.maxFileSizeMB ??
    defaultTextInputOptions[purpose].maxFileSizeMB;
  if (fileSize > maxFileSizeMB * 1024 * 1024)
    throw new ORPCError("BAD_REQUEST", {
      message: `File size exceeds the ${maxFileSizeMB}MB limit`,
    });

  const visibility =
    mediaOptions.visibility === "Private" ? "Private" : "Public";
  const uploadFileName = createUploadFileName(resolvedFileType);
  const typebotPathSegment = parseUploadPathSegment(typebotId);
  const blockPathSegment = parseUploadPathSegment(currentBlockId);
  const filePath =
    workspaceId && resultId
      ? `${visibility === "Private" ? "private" : "public"}/workspaces/${parseUploadPathSegment(
          workspaceId,
        )}/typebots/${typebotPathSegment}/results/${parseUploadPathSegment(
          resultId,
        )}/blocks/${blockPathSegment}/${uploadFileName}`
      : `public/tmp/typebots/${typebotPathSegment}/blocks/${blockPathSegment}/${uploadFileName}`;

  const { presignedUrl, publicFileUrl } = generatePresignedPutUrl({
    filePath,
    contentType: resolvedFileType,
    contentLength: fileSize,
  });

  return {
    presignedUrl,
    formData: {},
    fileType: resolvedFileType,
    maxFileSize: maxFileSizeMB,
    fileUrl:
      visibility === "Private" && resultId
        ? `${env.NEXTAUTH_URL}/api/typebots/${typebotId}/results/${resultId}/blocks/${currentBlockId}/${uploadFileName}`
        : publicFileUrl,
  };
};

/**
 * Browsers record voice messages as audio/* or audio-only MP4 / WebM, and some
 * phones label voice memos as 3GP.
 */
const isAcceptedMediaType = (
  purpose: MediaAnswerUploadPurpose,
  fileType: string,
) =>
  purpose === "videoClip"
    ? fileType.startsWith("video/")
    : fileType.startsWith("audio/") ||
      ["video/mp4", "video/webm", "video/3gpp"].includes(fileType);
