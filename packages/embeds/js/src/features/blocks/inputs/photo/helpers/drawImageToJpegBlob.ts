import {
  maxPhotoDimensionPx,
  maxPhotoFileSizeBytes,
} from "@typebot.io/blocks-inputs/photo/constants";

/**
 * JPEG of a camera frame or a decoded picture, scaled down so that its
 * longest side is at most 1920 px; quality is lowered if the file would
 * still exceed the upload limit.
 */
export const drawImageToJpegBlob = async ({
  source,
  width,
  height,
}: {
  source: CanvasImageSource;
  width: number;
  height: number;
}): Promise<Blob> => {
  if (width <= 0 || height <= 0) throw new Error("Empty image");
  const scale = Math.min(1, maxPhotoDimensionPx / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is not supported");
  // JPEG has no transparency: transparent PNG pixels become white.
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  for (const quality of [0.85, 0.7, 0.55]) {
    const blob = await canvasToBlob(canvas, quality);
    if (blob.size <= maxPhotoFileSizeBytes) return blob;
  }
  throw new Error("Photo too large");
};

const canvasToBlob = (canvas: HTMLCanvasElement, quality: number) =>
  new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("Could not create the JPEG")),
      "image/jpeg",
      quality,
    ),
  );
