import { unparse } from "papaparse";
import { isNumericLiteral } from "./coerceResearchValue";
import type { DatasetCell, ResearchDataset } from "./schemas";

export type CsvMode = "excelSafe" | "raw";

const formulaTriggerCharacters = ["=", "+", "-", "@", "\t", "\r"];

/**
 * Serializes a dataset to CSV without ever altering stored data.
 *
 * - `excelSafe` (default): neutralizes CSV/Excel formula injection by prefixing with `'`
 *   only the text cells that could be interpreted as formulas. Real numbers (`-5`, `3.2`)
 *   and numeric literals such as `+393401234567` are left untouched because a spreadsheet
 *   evaluates them as plain numbers. A UTF-8 BOM is added so Excel reads accents correctly.
 * - `raw`: values are written exactly as stored. Opening the file in a spreadsheet can
 *   execute formulas contained in respondents' answers: use it only for statistical software.
 */
export const serializeDatasetToCsv = (
  dataset: Pick<ResearchDataset, "columns" | "rows">,
  { mode }: { mode: CsvMode },
): string => {
  const sanitizeCell = (cell: DatasetCell) =>
    mode === "excelSafe" ? toExcelSafeCell(cell) : cell;
  const csv = unparse(
    {
      fields: dataset.columns.map((column) =>
        String(sanitizeCell(column.name)),
      ),
      data: dataset.rows.map((row) =>
        row.map((cell) => {
          const sanitizedCell = sanitizeCell(cell);
          return sanitizedCell === null ? "" : sanitizedCell;
        }),
      ),
    },
    { newline: "\r\n" },
  );
  return mode === "excelSafe" ? `﻿${csv}` : csv;
};

export const toExcelSafeCell = (cell: DatasetCell): DatasetCell => {
  if (typeof cell !== "string" || cell.length === 0) return cell;
  if (!formulaTriggerCharacters.includes(cell[0]!)) return cell;
  if (isNumericLiteral(cell)) return cell;
  return `'${cell}`;
};
