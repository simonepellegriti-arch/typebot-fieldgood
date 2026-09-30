import { InputBlockType } from "@typebot.io/blocks-inputs/constants";
import { type GroupV6, groupV6Schema } from "@typebot.io/groups/schemas";
import type { Variable } from "@typebot.io/variables/schemas";
import { z } from "zod";
import type {
  CodingProposal,
  OptionMapping,
  QuestionMapping,
} from "./matchQuestionnaireCoding";

export type CodingChange = {
  blockId: string;
  description: string;
};

/**
 * Applies a reviewed coding proposal to a questionnaire draft:
 * option / row / column codes (value), optionally the variable name and the
 * scores, exclusive and "other, specify" flags declared in Word.
 * Only confirmed, non ignored mappings are applied. Labels shown to respondents
 * are never changed. Published versions and saved answers are untouched: the
 * new codes only apply once the draft is published again.
 */
export const applyQuestionnaireCoding = (
  typebot: { groups: GroupV6[]; variables: Variable[] },
  proposal: CodingProposal,
  { createVariableId }: { createVariableId: () => string },
): {
  groups: GroupV6[];
  variables: Variable[];
  changes: CodingChange[];
  warnings: string[];
} => {
  const changes: CodingChange[] = [];
  const warnings: string[] = [];
  let variables = typebot.variables;
  const mappingsByBlockId = new Map(
    proposal.questions
      .filter(isQuestionMappingApplicable)
      .flatMap((mapping) =>
        mapping.blockId ? [[mapping.blockId, mapping] as const] : [],
      ),
  );

  const groups = typebot.groups.map((group) => ({
    ...group,
    blocks: group.blocks.map((block) => {
      const mapping = mappingsByBlockId.get(block.id);
      if (!mapping) return block;
      const optionMappings = mapping.options.filter(isOptionMappingApplicable);
      const findOptionMapping = (
        targetKind: OptionMapping["targetKind"],
        targetId: string,
      ) =>
        optionMappings.find(
          (option) =>
            option.targetKind === targetKind && option.targetId === targetId,
        );
      const withDeclared = mapping.shouldApplyDeclaredProperties;
      const describe = (label: string | undefined, from: unknown, to: string) =>
        changes.push({
          blockId: block.id,
          description: `${mapping.wordQuestion.variableName} · ${label ?? ""}: ${from ?? "—"} → ${to}`,
        });

      let updatedBlock = block;
      if (block.type === InputBlockType.CHOICE)
        updatedBlock = {
          ...block,
          items: block.items.map((item) => {
            const wordOption = findOptionMapping("item", item.id)?.wordOption;
            if (!wordOption) return item;
            if ((item.value ?? item.content) !== wordOption.code)
              describe(
                item.content,
                item.value ?? item.content,
                wordOption.code,
              );
            return {
              ...item,
              value: wordOption.code,
              ...(withDeclared && wordOption.score !== undefined
                ? { score: wordOption.score }
                : {}),
              ...(withDeclared && wordOption.isExclusive
                ? { isExclusive: true }
                : {}),
              ...(withDeclared && wordOption.hasTextInput
                ? { hasTextInput: true }
                : {}),
            };
          }),
        };
      if (block.type === InputBlockType.PICTURE_CHOICE)
        updatedBlock = {
          ...block,
          items: block.items.map((item) => {
            const wordOption = findOptionMapping("item", item.id)?.wordOption;
            if (!wordOption) return item;
            if ((item.value ?? item.title) !== wordOption.code)
              describe(item.title, item.value ?? item.title, wordOption.code);
            return { ...item, value: wordOption.code };
          }),
        };
      if (block.type === InputBlockType.MATRIX)
        updatedBlock = {
          ...block,
          options: {
            ...block.options,
            rows: block.options?.rows?.map((row) => {
              const wordOption = findOptionMapping("row", row.id)?.wordOption;
              if (!wordOption) return row;
              if (row.value !== wordOption.code)
                describe(row.label, row.value, wordOption.code);
              return { ...row, value: wordOption.code };
            }),
            columns: block.options?.columns?.map((column) => {
              const wordOption = findOptionMapping(
                "column",
                column.id,
              )?.wordOption;
              if (!wordOption) return column;
              if (column.value !== wordOption.code)
                describe(column.label, column.value, wordOption.code);
              return {
                ...column,
                value: wordOption.code,
                ...(withDeclared && wordOption.score !== undefined
                  ? { score: wordOption.score }
                  : {}),
              };
            }),
          },
        };

      if (!mapping.shouldSetVariableName || !("options" in updatedBlock))
        return updatedBlock;
      const variableName = mapping.wordQuestion.variableName;
      const currentVariableId =
        updatedBlock.options &&
        typeof updatedBlock.options === "object" &&
        "variableId" in updatedBlock.options &&
        typeof updatedBlock.options.variableId === "string"
          ? updatedBlock.options.variableId
          : undefined;
      const variableWithSameName = variables.find(
        (variable) =>
          variable.name.toUpperCase() === variableName.toUpperCase() &&
          variable.id !== currentVariableId,
      );
      if (currentVariableId) {
        if (variableWithSameName) {
          warnings.push(
            `${variableName}: another variable already has this name, the variable was not renamed.`,
          );
          return updatedBlock;
        }
        const currentVariable = variables.find(
          (variable) => variable.id === currentVariableId,
        );
        if (currentVariable && currentVariable.name !== variableName) {
          changes.push({
            blockId: block.id,
            description: `${currentVariable.name} → ${variableName} (variable)`,
          });
          variables = variables.map((variable) =>
            variable.id === currentVariableId
              ? { ...variable, name: variableName }
              : variable,
          );
        }
        return updatedBlock;
      }
      const variableId = variableWithSameName?.id ?? createVariableId();
      if (!variableWithSameName)
        variables = [...variables, { id: variableId, name: variableName }];
      changes.push({
        blockId: block.id,
        description: `${variableName} (variable) linked to the question`,
      });
      return {
        ...updatedBlock,
        options: { ...updatedBlock.options, variableId },
      };
    }),
  }));

  // Re-validated: the result is a regular questionnaire draft.
  return {
    groups: z.array(groupV6Schema).parse(groups),
    variables,
    changes,
    warnings,
  };
};

const isQuestionMappingApplicable = (mapping: QuestionMapping) =>
  !mapping.isIgnored &&
  mapping.blockId !== undefined &&
  (mapping.status === "MATCHED" ||
    mapping.status === "UNMATCHED" ||
    mapping.isConfirmed);

const isOptionMappingApplicable = (mapping: OptionMapping) =>
  !mapping.isIgnored &&
  mapping.wordOption !== undefined &&
  mapping.targetId !== undefined &&
  (mapping.status === "MATCHED" || mapping.isConfirmed);
