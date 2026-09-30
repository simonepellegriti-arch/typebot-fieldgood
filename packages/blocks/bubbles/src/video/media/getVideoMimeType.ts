const mimeTypesByExtension: Record<string, string> = {
  mp4: "video/mp4",
  m4v: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  ogv: "video/ogg",
  ogg: "video/ogg",
};

/**
 * MIME type announced to the browser in <source type="...">, from the URL
 * extension (query strings ignored). Unknown extensions return undefined so the
 * browser sniffs the content itself instead of skipping the source.
 */
export const getVideoMimeType = (
  url: string | undefined,
): string | undefined => {
  if (!url) return;
  const path = url.split(/[?#]/)[0] ?? "";
  const extension = path.split(".").pop()?.toLowerCase();
  return extension ? mimeTypesByExtension[extension] : undefined;
};
