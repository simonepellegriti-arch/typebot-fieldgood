import type { ChoiceInputBlock } from "@typebot.io/blocks-inputs/choice/schema";
import { sumDefinedScores } from "@typebot.io/blocks-inputs/scoring/sumDefinedScores";
import type { ParsedReply } from "../../../types";

/**
 * Adds the score of the selected option(s) to a parsed choice reply.
 * Single choice: score of the option (null when it has none).
 * Multiple choice: sum of the scores of the selected options (null when none has a score).
 * Blocks without any scored option are returned unchanged.
 */
export const addChoiceScores = (
  parsedReply: ParsedReply,
  { items }: { items: ChoiceInputBlock["items"] },
): ParsedReply => {
  if (parsedReply.status !== "success" || !parsedReply.structuredAnswer)
    return parsedReply;
  if (!items.some((item) => item.score !== undefined)) return parsedReply;
  const { value } = parsedReply.structuredAnswer;
  const selectedCodes = (Array.isArray(value) ? value : [value]).map((code) =>
    String(code),
  );
  const selectedItems = items.filter((item) => {
    const code = item.value ?? item.content?.trim();
    return code !== undefined && selectedCodes.includes(code);
  });
  const score = Array.isArray(value)
    ? sumDefinedScores(selectedItems.map((item) => item.score))
    : (selectedItems[0]?.score ?? null);
  return {
    ...parsedReply,
    structuredAnswer: { ...parsedReply.structuredAnswer, score },
  };
};
