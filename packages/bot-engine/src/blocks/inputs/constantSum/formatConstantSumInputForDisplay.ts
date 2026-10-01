import type { ConstantSumInputBlock } from "@typebot.io/blocks-inputs/constantSum/schema";
import type { SessionStore } from "@typebot.io/runtime-session-store";
import { deepParseVariables } from "@typebot.io/variables/deepParseVariables";
import type { Variable } from "@typebot.io/variables/schemas";
import { shuffleArray } from "../../../helpers/shuffleArray";

/** Variables injected in texts; categories shuffled when randomization is enabled (codes unchanged). */
export const formatConstantSumInputForDisplay = (
  block: ConstantSumInputBlock,
  {
    variables,
    sessionStore,
    random = Math.random,
  }: {
    variables: Variable[];
    sessionStore: SessionStore;
    random?: () => number;
  },
): ConstantSumInputBlock => {
  const parsedBlock = deepParseVariables(block, { variables, sessionStore });
  if (!parsedBlock.options?.areItemsRandomized) return parsedBlock;
  return {
    ...parsedBlock,
    options: {
      ...parsedBlock.options,
      items: shuffleArray(parsedBlock.options.items ?? [], random),
    },
  };
};
