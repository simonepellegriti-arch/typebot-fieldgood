import { isInputBlock } from "@typebot.io/blocks-core/helpers";
import type { Group } from "@typebot.io/groups/schemas";
import type { Variable } from "@typebot.io/variables/schemas";

export type ResearchStructureWarning =
  | {
      code: "duplicateVariableName";
      variableName: string;
      message: string;
    }
  | {
      code: "variableSharedByInputBlocks";
      variableName: string;
      blockIds: string[];
      message: string;
    }
  | {
      code: "inputBlockWithoutVariable";
      blockId: string;
      groupTitle: string;
      message: string;
    };

/**
 * Checks that the questionnaire produces a stable dataset structure.
 * Duplicate variable names are always reported. Stricter checks (every input block
 * saved in a variable, one input block per variable) are enabled as soon as the
 * typebot declares research metadata on at least one variable.
 */
export const validateResearchStructure = ({
  groups,
  variables,
}: {
  groups: Group[];
  variables: Variable[];
}): ResearchStructureWarning[] => {
  const warnings: ResearchStructureWarning[] = [];

  const variableNameOccurrences = new Map<string, number>();
  for (const variable of variables)
    variableNameOccurrences.set(
      variable.name,
      (variableNameOccurrences.get(variable.name) ?? 0) + 1,
    );
  for (const [variableName, occurrences] of variableNameOccurrences)
    if (occurrences > 1)
      warnings.push({
        code: "duplicateVariableName",
        variableName,
        message: `Variable name "${variableName}" is used ${occurrences} times: dataset columns would be ambiguous.`,
      });

  const isResearchTypebot = variables.some(
    (variable) =>
      variable.dataType !== undefined || variable.label !== undefined,
  );
  if (!isResearchTypebot) return warnings;

  const blockIdsByVariableId = new Map<string, string[]>();
  for (const group of groups)
    for (const block of group.blocks) {
      if (!isInputBlock(block)) continue;
      const variableId = block.options?.variableId;
      if (!variableId) {
        warnings.push({
          code: "inputBlockWithoutVariable",
          blockId: block.id,
          groupTitle: group.title,
          message: `An input block in "${group.title}" is not saved in a variable: its column name won't be human readable.`,
        });
        continue;
      }
      blockIdsByVariableId.set(variableId, [
        ...(blockIdsByVariableId.get(variableId) ?? []),
        block.id,
      ]);
    }

  for (const [variableId, blockIds] of blockIdsByVariableId) {
    if (blockIds.length < 2) continue;
    const variableName =
      variables.find((variable) => variable.id === variableId)?.name ??
      variableId;
    warnings.push({
      code: "variableSharedByInputBlocks",
      variableName,
      blockIds,
      message: `Variable "${variableName}" is filled by ${blockIds.length} different input blocks: the dataset will contain suffixed columns (${variableName}_2...).`,
    });
  }

  return warnings;
};
