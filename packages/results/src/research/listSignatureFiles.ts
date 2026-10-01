import { InputBlockType } from "@typebot.io/blocks-inputs/constants";
import type { DatasetDictionary, ResearchDataset } from "./schemas";
import { systemColumns } from "./schemas";

/**
 * Signature JPEGs of the exported interviews, named like the dataset so they
 * can be matched with it: <RESULT_ID>_<column>.jpg (e.g. "ck1…_FIRMA.jpg").
 */
export const listSignatureFiles = (
  dataset: ResearchDataset & { dictionary: DatasetDictionary },
): { fileName: string; url: string }[] => {
  const signatureQuestionIds = new Set(
    dataset.dictionary.questions
      .filter((question) => question.blockType === InputBlockType.SIGNATURE)
      .map((question) => question.id),
  );
  if (signatureQuestionIds.size === 0) return [];
  const resultIdIndex = dataset.columns.findIndex(
    (column) => column.name === systemColumns.resultId,
  );
  const signatureColumns = dataset.columns.flatMap((column, index) =>
    column.kind === "question" &&
    !column.isLabelColumn &&
    column.questionId &&
    signatureQuestionIds.has(column.questionId)
      ? [{ name: column.name, index }]
      : [],
  );
  return dataset.rows.flatMap((row, rowIndex) => {
    const resultId = String(row[resultIdIndex] ?? rowIndex + 1);
    return signatureColumns.flatMap(({ name, index }) => {
      const url = row[index];
      if (typeof url !== "string" || !/^https?:\/\//.test(url)) return [];
      return [{ fileName: toSafeFileName(`${resultId}_${name}.jpg`), url }];
    });
  });
};

const toSafeFileName = (fileName: string) => fileName.replace(/[^\w.-]+/g, "_");
