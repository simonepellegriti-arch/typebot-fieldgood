/**
 * Checks a voice / video file picked by the respondent before it is sent:
 * kind (audio / video) and size. Returns the reason it can't be sent, if any.
 */
export const checkMediaAnswerFile = ({
  file,
  kind,
  maxFileSizeMB,
}: {
  file: File;
  kind: "audio" | "video";
  maxFileSizeMB: number;
}): "wrongType" | "tooLarge" | undefined => {
  const isExpectedKind =
    kind === "video"
      ? file.type.startsWith("video/")
      : file.type.startsWith("audio/") ||
        // Some phones label voice memos as MP4 / 3GP containers.
        file.type === "video/mp4" ||
        file.type === "video/webm" ||
        file.type === "video/3gpp";
  if (!isExpectedKind) return "wrongType";
  if (file.size > maxFileSizeMB * 1024 * 1024) return "tooLarge";
  return undefined;
};
