import type { InputBlock } from "@typebot.io/blocks-inputs/schema";
import { applyScoreOperation } from "@typebot.io/blocks-inputs/scoring/applyScoreOperation";
import type { SessionState } from "@typebot.io/chat-session/schemas";
import type { StructuredAnswer } from "../types";
import { updateVariablesInSession } from "../updateVariablesInSession";

/**
 * Applies the answer score to the question's score variables (ADD / SUBTRACT /
 * SET / MULTIPLY). Answers without score (null) leave the variables untouched.
 * Inside loops the variables accumulate over iterations; each iteration also keeps
 * its own score on the saved answer.
 */
export const saveScoreVarsIfAny = ({
  block,
  state,
  structuredAnswer,
}: {
  block: InputBlock;
  state: SessionState;
  structuredAnswer: StructuredAnswer | undefined;
}): SessionState => {
  const score = structuredAnswer?.score;
  if (score === null || score === undefined) return state;
  const scoreTargets =
    block.options && "scoreTargets" in block.options
      ? block.options.scoreTargets
      : undefined;
  if (!scoreTargets || scoreTargets.length === 0) return state;

  let newState = state;
  for (const target of scoreTargets) {
    const variable = newState.typebotsQueue[0].typebot.variables.find(
      (variable) => variable.id === target.variableId,
    );
    if (!variable) continue;
    const { updatedState } = updateVariablesInSession({
      state: newState,
      currentBlockId: block.id,
      newVariables: [
        {
          ...variable,
          value: String(
            applyScoreOperation({
              currentValue: variable.value,
              score,
              operation: target.operation,
            }),
          ),
        },
      ],
    });
    newState = updatedState;
  }
  return newState;
};
