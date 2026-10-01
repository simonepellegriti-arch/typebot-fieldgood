/**
 * Some Android / desktop file pickers give no MIME type for media files
 * (e.g. .m4a, .mov, .mkv): infer it from the extension so the file can be
 * checked and uploaded with the right content type.
 */
export const withInferredMediaFileType = (file: File) => {
  if (file.type) return file;
  const extension = file.name.split(".").pop()?.toLowerCase();
  const inferredType = extension ? mimeTypeByExtension[extension] : undefined;
  if (!inferredType) return file;
  return new File([file], file.name, {
    type: inferredType,
    lastModified: file.lastModified,
  });
};

const mimeTypeByExtension: Record<string, string> = {
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  wav: "audio/wav",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  opus: "audio/ogg",
  flac: "audio/flac",
  weba: "audio/webm",
  amr: "audio/amr",
  mp4: "video/mp4",
  m4v: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  "3gp": "video/3gpp",
  mkv: "video/x-matroska",
  avi: "video/x-msvideo",
};
