import { defaultConstantSumInputOptions } from "@typebot.io/blocks-inputs/constantSum/constants";
import { validateConstantSumValues } from "@typebot.io/blocks-inputs/constantSum/helpers/validateConstantSumValues";
import type {
  ConstantSumInputBlock,
  ConstantSumStructuredReply,
} from "@typebot.io/blocks-inputs/constantSum/schema";
import { getMatrixCode } from "@typebot.io/blocks-inputs/matrix/helpers/getMatrixCode";
import type {
  Variable,
  VariableWithUnknowValue,
} from "@typebot.io/variables/schemas";
import type { ParsedReply } from "../../../types";
import { parseKeyedNumbers } from "../helpers/parseKeyedNumbers";

/**
 * Parses a constant sum reply ("give 100 points to the categories"):
 * value = amount by category code, every category included (0 when left empty),
 * so the export has one column per category plus the total.
 * Accepts the structured reply of the web client, or "1=40, 2=60" / a JSON object.
 */
export const parseConstantSumReply = (
  {
    text,
    structuredReply,
  }: { text: string; structuredReply: ConstantSumStructuredReply | undefined },
  { block, variables }: { block: ConstantSumInputBlock; variables: Variable[] },
): ParsedReply => {
  const items = block.options?.items ?? [];
  const valuesById = structuredReply?.values ?? parseKeyedNumbers(text, items);
  if (!valuesById) return { status: "fail" };
  const validation = validateConstantSumValues({
    values: valuesById,
    options: block.options,
  });
  if (validation.status !== "valid") return { status: "fail" };

  const unit = block.options?.unit ?? "";
  const totalLabel =
    block.options?.totalLabel ?? defaultConstantSumInputOptions.totalLabel;
  const valueByCode: Record<string, number> = {};
  const labelByCode: Record<string, string> = {};
  const contentLines: string[] = [];
  const variablesToUpdate: VariableWithUnknowValue[] = [];
  items.forEach((item, itemIndex) => {
    const amount = valuesById[item.id] ?? 0;
    const code = getMatrixCode(item, itemIndex);
    valueByCode[code] = amount;
    labelByCode[code] = `${amount}${unit}`;
    contentLines.push(`${item.label ?? code}: ${amount}${unit}`);
    const itemVariable = item.variableId
      ? variables.find((variable) => variable.id === item.variableId)
      : undefined;
    if (itemVariable)
      variablesToUpdate.push({ ...itemVariable, value: amount });
  });
  contentLines.push(`${totalLabel}: ${validation.sum}${unit}`);

  return {
    status: "success",
    content: contentLines.join("\n"),
    variablesToUpdate:
      variablesToUpdate.length > 0 ? variablesToUpdate : undefined,
    structuredAnswer: {
      value: valueByCode,
      label: labelByCode,
      variableValue: JSON.stringify(valueByCode),
    },
  };
};
