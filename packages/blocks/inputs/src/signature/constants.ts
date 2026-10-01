import type { SignatureInputOptions } from "./schema";

export const defaultSignatureInputOptions = {
  placeholder: "Sign here",
  clearLabel: "Clear",
  buttonLabel: "Send",
  isRequired: true,
  skipLabel: "Skip",
  visibility: "Auto",
} as const satisfies SignatureInputOptions;

/** Signatures are saved as JPEG on a white background. */
export const signatureFileType = "image/jpeg";
export const maxSignatureFileSizeBytes = 2 * 1024 * 1024;
