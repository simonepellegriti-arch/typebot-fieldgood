import type { PhotoInputOptions } from "./schema";

export const maxPhotosLimit = 10;

export const defaultPhotoInputOptions = {
  maxPhotos: 1,
  source: "camera",
  facingMode: "environment",
  buttonLabel: "Send",
  isRequired: true,
  skipLabel: "Skip",
  visibility: "Auto",
} as const satisfies PhotoInputOptions;

/** Photos are resized in the browser and saved as JPEG. */
export const photoFileType = "image/jpeg";
export const maxPhotoFileSizeBytes = 5 * 1024 * 1024;
/** Longest side of a saved photo, in pixels. */
export const maxPhotoDimensionPx = 1920;
/** Several photos are stored in one answer, separated like file uploads. */
export const photoUrlsSeparator = ", ";
