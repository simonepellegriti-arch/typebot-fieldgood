import {
  blockBaseSchema,
  optionBaseSchema,
} from "@typebot.io/blocks-base/schemas";
import { z } from "zod";
import { InputBlockType } from "../constants";
import { fileVisibilityOptions } from "../file/constants";
import {
  maxMediaAnswerFileSizeMB,
  maxVideoClipDurationSeconds,
  minMediaAnswerFileSizeMB,
  minVideoClipDurationSeconds,
} from "./mediaAnswerConstants";

/** Respondents can also send an existing audio / video file as their answer. */
const mediaFileUploadOptionsSchema = z.object({
  allowFileUpload: z.boolean().optional(),
  maxFileSizeMB: z
    .number()
    .int()
    .min(minMediaAnswerFileSizeMB)
    .max(maxMediaAnswerFileSizeMB)
    .optional(),
});

export const textInputOptionsBaseSchema = z.object({
  labels: z
    .object({
      placeholder: z.string().optional(),
      button: z.string().optional(),
    })
    .optional(),
});

export const inputModeOptions = [
  "text",
  "decimal",
  "numeric",
  "tel",
  "search",
  "email",
  "url",
] as const;

export const textInputOptionsSchema = textInputOptionsBaseSchema
  .merge(optionBaseSchema)
  .merge(
    z.object({
      isLong: z.boolean().optional(),
      inputMode: z.enum(inputModeOptions).optional(),
      audioClip: z
        .object({
          isEnabled: z.boolean().optional(),
          saveVariableId: z.string().optional(),
          visibility: z.enum(fileVisibilityOptions).optional(),
        })
        .merge(mediaFileUploadOptionsSchema)
        .optional(),
      /** Video answer recorded with the camera or uploaded (open questions). */
      videoClip: z
        .object({
          isEnabled: z.boolean().optional(),
          saveVariableId: z.string().optional(),
          visibility: z.enum(fileVisibilityOptions).optional(),
          maxDurationSeconds: z
            .number()
            .int()
            .min(minVideoClipDurationSeconds)
            .max(maxVideoClipDurationSeconds)
            .optional(),
        })
        .merge(mediaFileUploadOptionsSchema)
        .optional(),
      attachments: z
        .object({
          isEnabled: z.boolean().optional(),
          saveVariableId: z.string().optional(),
          visibility: z.enum(fileVisibilityOptions).optional(),
        })
        .optional(),
    }),
  );

export const textInputSchema = blockBaseSchema.merge(
  z.object({
    type: z.enum([InputBlockType.TEXT]),
    options: textInputOptionsSchema.optional(),
  }),
);

export type TextInputBlock = z.infer<typeof textInputSchema>;
