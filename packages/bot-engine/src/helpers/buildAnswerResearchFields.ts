import { InputBlockType } from "@typebot.io/blocks-inputs/constants";
import type { InputBlock } from "@typebot.io/blocks-inputs/schema";
import {
  coerceResearchValue,
  parseNumericLiteral,
} from "@typebot.io/results/research/coerceResearchValue";
import type {
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
} => {
  const rawValue = structuredAnswer
    ? structuredAnswer.value
    : deriveRawValueFromContent(block, content);
  return {
    value: coerceResearchValue(rawValue, variable?.dataType),
    valueLabel: structuredAnswer?.label ?? null,
  };
};

const deriveRawValueFromContent = (block: InputBlock, content: string) => {
  switch (block.type) {
    case InputBlockType.NUMBER:
    case InputBlockType.RATING:
      return parseNumericLiteral(content) ?? content;
    default:
      return content;
  }
};
