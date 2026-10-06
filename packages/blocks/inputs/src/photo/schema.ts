import {
  blockBaseSchema,
  optionBaseSchema,
} from "@typebot.io/blocks-base/schemas";
import { z } from "zod";
import { InputBlockType } from "../constants";
import { maxPhotosLimit } from "./constants";

export const photoSources = ["camera", "cameraOrGallery"] as const;
export const photoCameraFacingModes = ["environment", "user"] as const;

export const photoInputOptionsSchema = optionBaseSchema.extend({
  question: z.string().optional(),
  /** Photos the respondent can send (1 by default). */
  maxPhotos: z.number().int().min(1).max(maxPhotosLimit).optional(),
  /** Camera only (default) or also photos already in the phone gallery. */
  source: z.enum(photoSources).optional(),
  /** Rear camera (default) or front camera when the camera opens. */
  facingMode: z.enum(photoCameraFacingModes).optional(),
  buttonLabel: z.string().optional(),
  /** Not required: a "Skip" button is shown. */
  isRequired: z.boolean().optional(),
  skipLabel: z.string().optional(),
  /** Auto / Public: anyone with the link opens the JPEG. Private: builder users only. */
  visibility: z.enum(["Auto", "Public", "Private"]).optional(),
});

export const photoInputSchema = blockBaseSchema.merge(
  z.object({
    type: z.enum([InputBlockType.PHOTO]),
    options: photoInputOptionsSchema.optional(),
  }),
);

export type PhotoInputOptions = z.infer<typeof photoInputOptionsSchema>;
export type PhotoInputBlock = z.infer<typeof photoInputSchema>;
