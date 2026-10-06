import { drawImageToJpegBlob } from "./drawImageToJpegBlob";

/**
 * Photo picked from the gallery or taken with the phone camera app: decoded
 * upright (EXIF orientation applied), resized and saved as JPEG.
 */
export const imageFileToJpegBlob = async (file: File): Promise<Blob> => {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file, {
      imageOrientation: "from-image",
    }).catch(() => undefined);
    if (bitmap) {
      try {
        return await drawImageToJpegBlob({
          source: bitmap,
          width: bitmap.width,
          height: bitmap.height,
        });
      } finally {
        bitmap.close();
      }
    }
  }
  // Safari decodes some formats (HEIC) only through <img>.
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await loadImage(objectUrl);
    return await drawImageToJpegBlob({
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unreadable image"));
    image.src = src;
  });
