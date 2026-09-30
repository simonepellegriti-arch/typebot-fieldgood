import {
  blockBaseSchema,
  itemBaseSchemas,
  optionBaseSchema,
} from "@typebot.io/blocks-base/schemas";
import { conditionSchema } from "@typebot.io/conditions/schemas";
import { z } from "zod";
import { InputBlockType } from "../constants";

export const choiceInputOptionsSchema = optionBaseSchema.merge(
  z.object({
    isMultipleChoice: z.boolean().optional(),
    buttonLabel: z.string().optional(),
    dynamicVariableId: z.string().optional(),
    isSearchable: z.boolean().optional(),
    searchInputPlaceholder: z.string().optional(),
    areInitialSearchButtonsVisible: z.boolean().optional(),
    minSelections: z
      .number()
      .int()
      .positive()
      .optional()
      .describe(
        "Multiple choice only. An exclusive option is always valid, even below this minimum.",
      ),
    maxSelections: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("Multiple choice only."),
  }),
);

/**
 * Research properties of a choice option. All optional: options saved before they
 * existed behave exactly as before (not exclusive, no text input).
 */
export const choiceItemResearchSchema = z.object({
  isExclusive: z
    .boolean()
    .optional()
    .describe(
      "Multiple choice: selecting it deselects every other option (e.g. 'None of these').",
    ),
  hasTextInput: z
    .boolean()
    .optional()
    .describe("Shows a text field when selected ('Other, please specify')."),
  textInputRequired: z.boolean().optional(),
  textInputPlaceholder: z.string().optional(),
});

export const buttonItemSchemas = {
  v5: itemBaseSchemas.v5.extend({
    ...choiceItemResearchSchema.shape,
    content: z.string().optional(),
    value: z.string().optional(),
    displayCondition: z
      .object({
        isEnabled: z.boolean().optional(),
        condition: conditionSchema.optional(),
      })
      .optional(),
  }),
  v6: itemBaseSchemas.v6.extend({
    ...choiceItemResearchSchema.shape,
    content: z.string().optional(),
    value: z.string().optional(),
    displayCondition: z
      .object({
        isEnabled: z.boolean().optional(),
        condition: conditionSchema.optional(),
      })
      .optional(),
  }),
};

export const buttonItemSchema = z.union([
  buttonItemSchemas.v5,
  buttonItemSchemas.v6,
]);

export const buttonsInputV5Schema = blockBaseSchema.merge(
  z.object({
    type: z.enum([InputBlockType.CHOICE]),
    items: z.array(buttonItemSchemas.v5),
    options: choiceInputOptionsSchema.optional(),
  }),
);

export const buttonsInputSchemas = {
  v5: buttonsInputV5Schema,
  v6: buttonsInputV5Schema.extend({
    items: z.array(buttonItemSchemas.v6),
  }),
} as const;

export const buttonsInputSchema = z.union([
  buttonsInputSchemas.v5,
  buttonsInputSchemas.v6,
]);

export type ButtonItem = z.infer<typeof buttonItemSchema>;
export type ChoiceInputBlock = z.infer<typeof buttonsInputSchema>;

/**
 * Structured reply sent by the web client for choice inputs.
 * Plain text replies (API, WhatsApp) keep working and are parsed as before.
 */
export const choiceStructuredReplySchema = z.object({
  type: z.literal("choice"),
  itemIds: z.array(z.string()).max(500),
  /** Open answers of "Other, please specify" options, by item id. Never merged into labels. */
  otherTexts: z.record(z.string(), z.string().max(5000)).optional(),
});
export type ChoiceStructuredReply = z.infer<typeof choiceStructuredReplySchema>;
