import { getMatrixCode } from "@typebot.io/blocks-inputs/matrix/helpers/getMatrixCode";
import { validateMatrixAnswers } from "@typebot.io/blocks-inputs/matrix/helpers/validateMatrixAnswers";
import type {
  MatrixInputBlock,
  MatrixStructuredReply,
} from "@typebot.io/blocks-inputs/matrix/schema";
import { sumDefinedScores } from "@typebot.io/blocks-inputs/scoring/sumDefinedScores";
import { parseNumericLiteral } from "@typebot.io/results/research/coerceResearchValue";
import type { MatrixAnswerValue } from "@typebot.io/results/schemas/answers";
import type {
  Variable,
  VariableWithUnknowValue,
} from "@typebot.io/variables/schemas";
import type { ParsedReply } from "../../../types";

/**
 * Parses a matrix reply into codes:
 * - value: column code(s) by row code ({"1": 4, "2": 3}), numbers when codes are numeric;
 * - label: column label(s) by row code;
 * - content: human readable lines for the results table, webhooks and transcripts.
 * Accepts the structured reply of the web client, or a JSON object text
 * ({"<row code or label>": "<column code or label>"}) for API clients.
 */
export const parseMatrixReply = (
  {
    text,
    structuredReply,
  }: { text: string; structuredReply: MatrixStructuredReply | undefined },
  { block, variables }: { block: MatrixInputBlock; variables: Variable[] },
): ParsedReply => {
  const rows = block.options?.rows ?? [];
  const columns = block.options?.columns ?? [];
  const answers = structuredReply?.answers ?? parseTextMatrixReply(text, block);
  if (!answers) return { status: "fail" };

  const validation = validateMatrixAnswers({ answers, options: block.options });
  if (validation.status === "invalid") return { status: "fail" };

  const isMultiplePerRow = block.options?.answerMode === "multiple";
  const value: MatrixAnswerValue = {};
  const label: Record<string, string | string[]> = {};
  const contentLines: string[] = [];
  const variablesToUpdate: VariableWithUnknowValue[] = [];
  const rowScores: Record<string, number | null> = {};
  const hasScoredColumns = columns.some((column) => column.score !== undefined);

  rows.forEach((row, rowIndex) => {
    const selectedColumnIds = answers[row.id] ?? [];
    if (selectedColumnIds.length === 0) return;
    const selectedColumns = columns.flatMap((column, columnIndex) =>
      selectedColumnIds.includes(column.id)
        ? [
            {
              code: getMatrixCode(column, columnIndex),
              label: column.label ?? getMatrixCode(column, columnIndex),
              score: column.score,
            },
          ]
        : [],
    );
    const rowCode = getMatrixCode(row, rowIndex);
    const codes = selectedColumns.map((column) => column.code);
    const typedCodes = toTypedCodes(codes);
    value[rowCode] = isMultiplePerRow ? typedCodes : typedCodes[0]!;
    const columnLabels = selectedColumns.map((column) => column.label);
    label[rowCode] = isMultiplePerRow ? columnLabels : columnLabels[0]!;
    contentLines.push(`${row.label ?? rowCode}: ${columnLabels.join(", ")}`);
    if (hasScoredColumns)
      rowScores[rowCode] = sumDefinedScores(
        selectedColumns.map((column) => column.score),
      );

    const rowVariable = row.variableId
      ? variables.find((variable) => variable.id === row.variableId)
      : undefined;
    if (rowVariable)
      variablesToUpdate.push({
        ...rowVariable,
        value: isMultiplePerRow ? codes : codes[0],
      });
  });

  if (contentLines.length === 0 && Object.keys(answers).length > 0)
    return { status: "fail" };

  return {
    status: "success",
    content: contentLines.join("\n"),
    variablesToUpdate:
      variablesToUpdate.length > 0 ? variablesToUpdate : undefined,
    structuredAnswer: {
      value,
      label,
      variableValue: JSON.stringify(value),
      ...(hasScoredColumns
        ? {
            score: sumDefinedScores(Object.values(rowScores)),
            details: { rowScores },
          }
        : {}),
    },
  };
};

/** Numeric codes are stored as numbers only when every code of the row is numeric. */
const toTypedCodes = (codes: string[]): string[] | number[] => {
  const numericCodes = codes.map((code) => parseNumericLiteral(code));
  return numericCodes.every((code) => code !== undefined)
    ? numericCodes.filter((code): code is number => code !== undefined)
    : codes;
};

/**
 * Text replies (API, WhatsApp): a JSON object {"<row>": "<column>" | ["<column>"]}
 * or "row=column" pairs separated by commas, semicolons or line breaks ("1=4, 2=3").
 * Rows and columns can be referenced by code, label or id.
 */
const parseTextMatrixReply = (
  text: string,
  block: MatrixInputBlock,
): Record<string, string[]> | undefined => {
  const parsedText = parseJsonObject(text) ?? parseCodePairs(text);
  if (!parsedText) return;
  const rows = block.options?.rows ?? [];
  const columns = block.options?.columns ?? [];
  const answers: Record<string, string[]> = {};
  for (const [rowKey, columnKeys] of Object.entries(parsedText)) {
    const rowIndex = rows.findIndex(
      (row, index) =>
        row.id === rowKey ||
        getMatrixCode(row, index) === rowKey ||
        row.label?.trim() === rowKey.trim(),
    );
    const row = rows[rowIndex];
    if (!row) return;
    const keys = Array.isArray(columnKeys) ? columnKeys : [columnKeys];
    const columnIds: string[] = [];
    for (const columnKey of keys) {
      const stringKey = String(columnKey).trim();
      const column = columns.find(
        (column, index) =>
          column.id === stringKey ||
          getMatrixCode(column, index) === stringKey ||
          column.label?.trim() === stringKey,
      );
      if (!column) return;
      columnIds.push(column.id);
    }
    answers[row.id] = columnIds;
  }
  return answers;
};

const parseJsonObject = (text: string): Record<string, unknown> | undefined => {
  try {
    const parsedJson: unknown = JSON.parse(text);
    if (
      parsedJson &&
      typeof parsedJson === "object" &&
      !Array.isArray(parsedJson)
    )
      return Object.fromEntries(Object.entries(parsedJson));
  } catch {
    return;
  }
};

const parseCodePairs = (text: string): Record<string, string[]> | undefined => {
  const pairs = text
    .split(/[,;\n]+/)
    .map((pair) => pair.trim())
    .filter(Boolean);
  if (pairs.length === 0) return;
  const answers: Record<string, string[]> = {};
  for (const pair of pairs) {
    const [rowKey, columnKey, ...rest] = pair
      .split("=")
      .map((part) => part.trim());
    if (!rowKey || !columnKey || rest.length > 0) return;
    answers[rowKey] = [...(answers[rowKey] ?? []), columnKey];
  }
  return answers;
};
