import type { MatrixInputBlock } from "@typebot.io/blocks-inputs/matrix/schema";
import type { SessionStore } from "@typebot.io/runtime-session-store";
import { deepParseVariables } from "@typebot.io/variables/deepParseVariables";
import type { Variable } from "@typebot.io/variables/schemas";
import { shuffleArray } from "../../../helpers/shuffleArray";

/**
 * Prepares a matrix for the respondent: variables are injected in texts and rows /
 * columns are shuffled when randomization is enabled. Only the display order changes:
 * ids and codes are untouched, and the builder order stays the reference for exports.
 */
export const formatMatrixInputForDisplay = (
  block: MatrixInputBlock,
  {
    variables,
    sessionStore,
    random = Math.random,
  }: {
    variables: Variable[];
    sessionStore: SessionStore;
    random?: () => number;
  },
): MatrixInputBlock => {
  const parsedBlock = deepParseVariables(block, { variables, sessionStore });
  if (!parsedBlock.options) return parsedBlock;
  const rows = parsedBlock.options.rows ?? [];
  const columns = parsedBlock.options.columns ?? [];
  return {
    ...parsedBlock,
    options: {
      ...parsedBlock.options,
      rows: parsedBlock.options.areRowsRandomized
        ? shuffleArray(rows, random)
        : rows,
      columns: parsedBlock.options.areColumnsRandomized
        ? shuffleArray(columns, random)
        : columns,
    },
  };
};
