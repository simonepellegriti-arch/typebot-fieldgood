import { isInputBlock } from "@typebot.io/blocks-core/helpers";
import type { Block } from "@typebot.io/blocks-core/schemas/schema";
import { InputBlockType } from "@typebot.io/blocks-inputs/constants";
import type { SessionState } from "@typebot.io/chat-session/schemas";
import { z } from "zod";

/**
 * Answers of the interview for the Airtable dashboard, one field per variable
 * under its header (the short question title, or the variable name), only
 * for fields that exist in the table. Choice and grid answers are written
 * with their labels, so the client reads "Molto" instead of "1".
 */
export const getAirtableAnswerFields = (
  state: SessionState,
  {
    fieldNames,
    excludedNames,
    fieldMap = {},
  }: {
    fieldNames: string[];
    excludedNames: Set<string>;
    fieldMap?: Record<string, string>;
  },
) => {
  const { typebot } = state.typebotsQueue[0];
  const fieldSet = new Set(fieldNames);
  const labelersByVariableId = getAnswerLabelers(typebot.groups);
  const fields: Record<string, string> = {};
  for (const variable of typebot.variables) {
    const fieldName = fieldMap[variable.name] ?? variable.name;
    if (!fieldSet.has(fieldName) || excludedNames.has(variable.name)) continue;
    if (variable.value === undefined || variable.value === null) continue;
    const text = stringifyValue(variable.value);
    const labeler = labelersByVariableId.get(variable.id);
    fields[fieldName] = labeler ? labeler(text) : text;
  }
  return fields;
};

const stringifyValue = (value: unknown) =>
  Array.isArray(value)
    ? value.map(String).join(", ")
    : typeof value === "object"
      ? JSON.stringify(value)
      : String(value);

type Groups = SessionState["typebotsQueue"][number]["typebot"]["groups"];

const getAnswerLabelers = (groups: Groups) => {
  const labelers = new Map<string, (value: string) => string>();
  const blocks: Block[] = groups.flatMap((group): Block[] => group.blocks);
  for (const block of blocks) {
    if (!isInputBlock(block)) continue;
    const variableId = block.options?.variableId;
    if (!variableId) continue;
    if (block.type === InputBlockType.CHOICE) {
      const labelsByCode = new Map(
        (block.items ?? []).flatMap((item) =>
          item.content ? [[item.value ?? item.content, item.content]] : [],
        ),
      );
      labelers.set(variableId, (value) =>
        value
          .split(", ")
          .map((part) => labelsByCode.get(part) ?? part)
          .join(", "),
      );
    }
    if (block.type === InputBlockType.MATRIX) {
      const rows = block.options?.rows ?? [];
      const columns = block.options?.columns ?? [];
      const labelOf = (
        items: { value?: string; label?: string }[],
        code: string,
      ) =>
        items.find((item) => (item.value ?? item.label) === code)?.label ??
        code;
      labelers.set(variableId, (value) => {
        const parsed = matrixAnswerSchema.safeParse(safeJsonParse(value)).data;
        if (!parsed) return value;
        return Object.entries(parsed)
          .map(
            ([rowCode, answer]) =>
              `${labelOf(rows, rowCode)}: ${[answer]
                .flat()
                .map((columnCode) => labelOf(columns, String(columnCode)))
                .join(", ")}`,
          )
          .join("\n");
      });
    }
  }
  return labelers;
};

const matrixAnswerSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.array(z.union([z.string(), z.number()]))]),
);

const safeJsonParse = (value: string) => {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
};
