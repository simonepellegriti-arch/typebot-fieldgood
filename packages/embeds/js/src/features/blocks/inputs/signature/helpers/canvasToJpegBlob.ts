/**
 * JPEG of the signature: transparent pixels become white (JPEG has no alpha).
 * Large pads are scaled down to keep files small (max 1200 px wide).
 */
export const canvasToJpegBlob = (
  sourceCanvas: HTMLCanvasElement,
  {
    maxWidth = 1200,
    quality = 0.9,
  }: { maxWidth?: number; quality?: number } = {},
): Promise<Blob> => {
  const scale = Math.min(1, maxWidth / sourceCanvas.width);
  const jpegCanvas = document.createElement("canvas");
  jpegCanvas.width = Math.round(sourceCanvas.width * scale);
  jpegCanvas.height = Math.round(sourceCanvas.height * scale);
  const context = jpegCanvas.getContext("2d");
  if (!context) return Promise.reject(new Error("Canvas is not supported"));
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, jpegCanvas.width, jpegCanvas.height);
  context.drawImage(sourceCanvas, 0, 0, jpegCanvas.width, jpegCanvas.height);
  return new Promise((resolve, reject) =>
    jpegCanvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("Could not create the JPEG")),
      "image/jpeg",
      quality,
    ),
  );
};
