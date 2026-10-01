import {
  blockBaseSchema,
  optionBaseSchema,
} from "@typebot.io/blocks-base/schemas";
import { z } from "zod";
import { InputBlockType } from "../constants";

export const signatureInputOptionsSchema = optionBaseSchema.extend({
  question: z.string().optional(),
  placeholder: z.string().optional(),
  clearLabel: z.string().optional(),
  buttonLabel: z.string().optional(),
  /** Not required: a "Skip" button is shown. */
  isRequired: z.boolean().optional(),
  skipLabel: z.string().optional(),
  /** Auto / Public: anyone with the link opens the JPEG. Private: builder users only. */
  visibility: z.enum(["Auto", "Public", "Private"]).optional(),
});

export const signatureInputSchema = blockBaseSchema.merge(
  z.object({
    type: z.enum([InputBlockType.SIGNATURE]),
    options: signatureInputOptionsSchema.optional(),
  }),
);

export type SignatureInputOptions = z.infer<typeof signatureInputOptionsSchema>;
export type SignatureInputBlock = z.infer<typeof signatureInputSchema>;
