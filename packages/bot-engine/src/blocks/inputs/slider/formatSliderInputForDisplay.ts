import type { SliderInputBlock } from "@typebot.io/blocks-inputs/slider/schema";
import type { SessionStore } from "@typebot.io/runtime-session-store";
import { deepParseVariables } from "@typebot.io/variables/deepParseVariables";
import type { Variable } from "@typebot.io/variables/schemas";
import { shuffleArray } from "../../../helpers/shuffleArray";

/** Variables injected in texts; statements shuffled when randomization is enabled (codes unchanged). */
export const formatSliderInputForDisplay = (
  block: SliderInputBlock,
  {
    variables,
    sessionStore,
    random = Math.random,
  }: {
    variables: Variable[];
    sessionStore: SessionStore;
    random?: () => number;
  },
): SliderInputBlock => {
  const parsedBlock = deepParseVariables(block, { variables, sessionStore });
  if (!parsedBlock.options?.areRowsRandomized) return parsedBlock;
  return {
    ...parsedBlock,
    options: {
      ...parsedBlock.options,
      rows: shuffleArray(parsedBlock.options.rows ?? [], random),
    },
  };
};
