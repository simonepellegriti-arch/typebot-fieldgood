import { InputBlockType } from "@typebot.io/blocks-inputs/constants";
import type { InputBlock } from "@typebot.io/blocks-inputs/schema";
import {
  coerceResearchValue,
  parseNumericLiteral,
} from "@typebot.io/results/research/coerceResearchValue";
import type {
  AnswerOtherTexts,
  AnswerResearchValue,
  AnswerValueLabel,
} from "@typebot.io/results/schemas/answers";
import type { Variable } from "@typebot.io/variables/schemas";
import type { StructuredAnswer } from "../types";

/**
 * Computes the research fields persisted next to the legacy `content`:
 * - `value`: typed value (codes, numbers, arrays for multiple choice)
 * - `valueLabel`: what the respondent saw
 */
export const buildAnswerResearchFields = ({
  block,
  content,
  structuredAnswer,
  variable,
}: {
  block: InputBlock;
  content: string;
  structuredAnswer: StructuredAnswer | undefined;
  variable: Pick<Variable, "dataType"> | undefined;
}): {
  value: AnswerResearchValue | null;
  valueLabel: AnswerValueLabel | null;
  otherTexts: AnswerOtherTexts | null;
} => {
  const rawValue = structuredAnswer
    ? structuredAnswer.value
    : deriveRawValueFromContent(block, content);
  return {
    // Objects (matrix rows, video watch results) are already typed per field.
    value: isPlainObject(rawValue)
      ? rawValue
      : coerceResearchValue(rawValue, variable?.dataType),
    valueLabel: structuredAnswer?.label ?? null,
    otherTexts: structuredAnswer?.otherTexts ?? null,
  };
};

const isPlainObject = (
  value: unknown,
): value is Exclude<
  AnswerResearchValue,
  string | number | boolean | string[] | number[]
> => typeof value === "object" && value !== null && !Array.isArray(value);

const deriveRawValueFromContent = (block: InputBlock, content: string) => {
  switch (block.type) {
    case InputBlockType.NUMBER:
    case InputBlockType.RATING:
      return parseNumericLiteral(content) ?? content;
    default:
      return content;
  }
};
