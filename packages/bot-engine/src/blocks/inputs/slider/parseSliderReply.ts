import { getMatrixCode } from "@typebot.io/blocks-inputs/matrix/helpers/getMatrixCode";
import { getSliderRows } from "@typebot.io/blocks-inputs/slider/helpers/getSliderRows";
import { validateSliderValues } from "@typebot.io/blocks-inputs/slider/helpers/validateSliderValues";
import type {
  SliderInputBlock,
  SliderStructuredReply,
} from "@typebot.io/blocks-inputs/slider/schema";
import type {
  Variable,
  VariableWithUnknowValue,
} from "@typebot.io/variables/schemas";
import type { ParsedReply } from "../../../types";
import { parseKeyedNumbers } from "../helpers/parseKeyedNumbers";

/**
 * Parses a slider reply into plain numbers (-100..+100 by default):
 * - one statement: value = the number (D5 = 75);
 * - several statements: value = number by statement code ({"1": 75, "2": -20}).
 * Accepts the structured reply of the web client, or text for API / WhatsApp
 * clients: "75" for a single slider, "1=75, 2=-20" or a JSON object otherwise.
 */
export const parseSliderReply = (
  {
    text,
    structuredReply,
  }: { text: string; structuredReply: SliderStructuredReply | undefined },
  { block, variables }: { block: SliderInputBlock; variables: Variable[] },
): ParsedReply => {
  const rows = getSliderRows(block.options);
  const valuesById =
    structuredReply?.values ?? parseTextSliderReply(text, block);
  if (!valuesById) return { status: "fail" };
  if (
    validateSliderValues({ values: valuesById, options: block.options })
      .status !== "valid"
  )
    return { status: "fail" };

  const unit = block.options?.unit ?? "";
  const variablesToUpdate: VariableWithUnknowValue[] = [];
  const valueByCode: Record<string, number> = {};
  const labelByCode: Record<string, string> = {};
  const contentLines: string[] = [];
  rows.forEach((row, rowIndex) => {
    const value = valuesById[row.id];
    if (value === undefined) return;
    const code = getMatrixCode(row, rowIndex);
    valueByCode[code] = value;
    labelByCode[code] = `${value}${unit}`;
    contentLines.push(
      row.label ? `${row.label}: ${value}${unit}` : `${value}${unit}`,
    );
    const rowVariable = row.variableId
      ? variables.find((variable) => variable.id === row.variableId)
      : undefined;
    if (rowVariable) variablesToUpdate.push({ ...rowVariable, value });
  });

  const isSingleSlider = rows.length === 1;
  const singleValue = Object.values(valueByCode)[0];
  return {
    status: "success",
    content: contentLines.join("\n"),
    variablesToUpdate:
      variablesToUpdate.length > 0 ? variablesToUpdate : undefined,
    structuredAnswer:
      isSingleSlider && singleValue !== undefined
        ? {
            value: singleValue,
            label: `${singleValue}${unit}`,
            variableValue: String(singleValue),
          }
        : {
            value: valueByCode,
            label: labelByCode,
            variableValue: JSON.stringify(valueByCode),
          },
  };
};

const parseTextSliderReply = (
  text: string,
  block: SliderInputBlock,
): Record<string, number> | undefined => {
  const rows = getSliderRows(block.options);
  const singleRow = rows.length === 1 ? rows[0] : undefined;
  if (singleRow) {
    const value = parseLooseNumber(text);
    if (value !== undefined) return { [singleRow.id]: value };
  }
  return parseKeyedNumbers(text, rows);
};

const parseLooseNumber = (text: string) => {
  const cleanedText = text.trim().replace(/%$/, "").replace(",", ".").trim();
  if (!/^[-+]?\d+(\.\d+)?$/.test(cleanedText)) return;
  return Number(cleanedText);
};
