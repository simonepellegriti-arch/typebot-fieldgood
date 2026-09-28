import type { Codebook } from "../buildCodebook";
import type { DatasetCell, ResearchDataset } from "../schemas";
import {
  type SavCell,
  type SavMultipleResponseSet,
  type SavVariable,
  writeSavFile,
} from "./writeSavFile";

/**
 * Converts a research dataset + its codebook into an SPSS .sav file:
 * variable names/labels, value labels, missing values, measurement levels,
 * datetimes (wall-clock time in the export time zone) and multiple response sets.
 */
export const convertDatasetToSav = ({
  dataset,
  codebook,
  fileLabel,
  now,
}: {
  dataset: Pick<ResearchDataset, "columns" | "rows">;
  codebook: Pick<Codebook, "variables" | "multipleResponseSets">;
  fileLabel?: string;
  now?: Date;
}): Uint8Array => {
  const savVariables = codebook.variables.map<SavVariable>(
    (codebookVariable, columnIndex) => {
      const columnCells = dataset.rows.map((row) => row[columnIndex] ?? null);
      if (codebookVariable.type === "datetime")
        return {
          name: codebookVariable.spssName,
          label: codebookVariable.label,
          type: "datetime",
          measure: "scale",
        };
      const isNumericColumn =
        codebookVariable.type === "numeric" &&
        columnCells.every(
          (cell) =>
            cell === null ||
            typeof cell === "number" ||
            typeof cell === "boolean",
        );
      if (!isNumericColumn)
        return {
          name: codebookVariable.spssName,
          label: codebookVariable.label,
          type: "string",
          measure: "nominal",
        };
      return {
        name: codebookVariable.spssName,
        label: codebookVariable.label,
        type: "numeric",
        decimals: computeDecimals(columnCells),
        measure: codebookVariable.measure,
        valueLabels: codebookVariable.valueLabels?.flatMap((valueLabel) =>
          typeof valueLabel.value === "number"
            ? [{ value: valueLabel.value, label: valueLabel.label }]
            : [],
        ),
        missingValues: codebookVariable.missingValues?.filter(
          (missingValue): missingValue is number =>
            typeof missingValue === "number",
        ),
      };
    },
  );

  const savRows = dataset.rows.map((row) =>
    savVariables.map((savVariable, columnIndex) =>
      toSavCell(row[columnIndex] ?? null, savVariable.type),
    ),
  );

  // Codebook multiple response sets already reference SPSS variable names.
  const multipleResponseSets =
    codebook.multipleResponseSets.map<SavMultipleResponseSet>((set) => ({
      name: set.name,
      label: set.label,
      type: set.type,
      countedValue: set.countedValue,
      variableNames: set.variables,
    }));

  return writeSavFile({
    variables: savVariables,
    rows: savRows,
    fileLabel,
    multipleResponseSets,
    now,
  });
};

const toSavCell = (cell: DatasetCell, type: SavVariable["type"]): SavCell => {
  if (cell === null) return null;
  switch (type) {
    case "numeric":
      if (typeof cell === "boolean") return cell ? 1 : 0;
      return typeof cell === "number" ? cell : null;
    case "datetime":
      return typeof cell === "string" ? parseWallClockDate(cell) : null;
    case "string":
      return String(cell);
  }
};

/**
 * Timestamps are exported as ISO 8601 strings in the chosen time zone
 * (e.g. 2026-09-28T16:40:14.438+02:00). SPSS datetimes have no time zone:
 * we keep the wall-clock time as displayed in the export time zone.
 */
const parseWallClockDate = (isoString: string): Date | null => {
  const match = isoString.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?/,
  );
  if (!match) return null;
  const [, year, month, day, hours, minutes, seconds, milliseconds] = match;
  return new Date(
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hours),
      Number(minutes),
      Number(seconds),
      Number((milliseconds ?? "0").padEnd(3, "0")),
    ),
  );
};

const computeDecimals = (cells: DatasetCell[]) =>
  Math.min(
    4,
    cells.reduce<number>((maxDecimals, cell) => {
      if (typeof cell !== "number" || Number.isInteger(cell))
        return maxDecimals;
      const decimalPart = String(cell).split(".")[1] ?? "";
      return Math.max(maxDecimals, decimalPart.length);
    }, 0),
  );
