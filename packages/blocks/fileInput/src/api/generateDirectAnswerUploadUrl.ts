import { env } from "@typebot.io/env";
import {
  createUploadFileName,
  parseUploadPathSegment,
} from "@typebot.io/lib/s3/createUploadFilePath";
import { generatePresignedPutUrl } from "@typebot.io/lib/s3/generatePresignedPutUrl";

/**
 * Signed PUT straight to the storage for an answer file (voice / video answer,
 * signature) whose type and size were checked by the caller. Bypasses the
 * upload proxy and its request size limit; the storage rejects any other type or size.
 */
export const generateDirectAnswerUploadUrl = ({
  visibility,
  fileType,
  fileSize,
  maxFileSizeMB,
  typebotId,
  workspaceId,
  resultId,
  currentBlockId,
}: {
  visibility: "Public" | "Private";
  fileType: string;
  fileSize: number;
  maxFileSizeMB: number;
  typebotId: string;
  workspaceId: string | undefined;
  resultId: string | undefined;
  currentBlockId: string;
}) => {
  const uploadFileName = createUploadFileName(fileType);
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
    contentType: fileType,
    contentLength: fileSize,
  });

  return {
    presignedUrl,
    formData: {},
    fileType,
    maxFileSize: maxFileSizeMB,
    fileUrl:
      visibility === "Private" && resultId
        ? `${env.NEXTAUTH_URL}/api/typebots/${typebotId}/results/${resultId}/blocks/${currentBlockId}/${uploadFileName}`
        : publicFileUrl,
  };
};
