type Props = {
  presignedUrl: string;
  formData?: Record<string, string>;
  file: File;
  /** Content type accepted (and signed) by the server, when it normalized it. */
  contentType?: string;
};

export const uploadFileWithPresignedPostData = ({
  presignedUrl,
  formData,
  file,
  contentType,
}: Props): Promise<Response> => {
  if (!formData || Object.keys(formData).length === 0) {
    return fetch(presignedUrl, {
      method: "PUT",
      body: file,
      headers: {
        "Content-Type": contentType ?? file.type,
        "Cache-Control": "public, max-age=86400",
      },
    });
  }

  const body = new FormData();

  for (const [key, value] of Object.entries(formData)) {
    body.append(key, value);
  }

  body.append("file", file);

  return fetch(presignedUrl, {
    method: "POST",
    body,
  });
};
