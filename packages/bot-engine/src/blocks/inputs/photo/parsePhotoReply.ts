import {
  defaultPhotoInputOptions,
  photoUrlsSeparator,
} from "@typebot.io/blocks-inputs/photo/constants";
import type { PhotoInputBlock } from "@typebot.io/blocks-inputs/photo/schema";
import type { ParsedReply } from "../../../types";
import { isOwnAnswerJpegUrl } from "../helpers/isOwnAnswerJpegUrl";

/**
 * A photo reply is the list of the JPEG links uploaded by the web client
 * (separated by ", "), between 1 and the block maximum. Only JPEG files of
 * our own storage are accepted.
 */
export const parsePhotoReply = (
  text: string | undefined,
  { block }: { block: PhotoInputBlock },
): ParsedReply => {
  const isRequired =
    block.options?.isRequired ?? defaultPhotoInputOptions.isRequired;
  if (text === undefined)
    return isRequired ? { status: "fail" } : { status: "skip" };
  const urls = [
    ...new Set(
      text
        .split(",")
        .map((url) => url.trim())
        .filter(Boolean),
    ),
  ];
  const maxPhotos =
    block.options?.maxPhotos ?? defaultPhotoInputOptions.maxPhotos;
  if (urls.length === 0 || urls.length > maxPhotos) return { status: "fail" };
  if (!urls.every(isOwnAnswerJpegUrl)) return { status: "fail" };
  const content = urls.join(photoUrlsSeparator);
  return {
    status: "success",
    content,
    structuredAnswer: { value: content, label: content },
  };
};
