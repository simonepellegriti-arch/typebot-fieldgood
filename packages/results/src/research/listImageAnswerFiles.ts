import { InputBlockType } from "@typebot.io/blocks-inputs/constants";
import type { DatasetDictionary, ResearchDataset } from "./schemas";
import { systemColumns } from "./schemas";

const imageAnswerBlockTypes: ReadonlySet<string> = new Set([
  InputBlockType.SIGNATURE,
  InputBlockType.PHOTO,
]);

/**
 * Signature and photo JPEGs of the exported interviews, named like the
 * dataset so they can be matched with it: <RESULT_ID>_<column>.jpg, or
 * <RESULT_ID>_<column>_<n>.jpg when a photo answer holds several photos.
 */
export const listImageAnswerFiles = (
  dataset: ResearchDataset & { dictionary: DatasetDictionary },
): { fileName: string; url: string }[] => {
  const imageQuestionIds = new Set(
    dataset.dictionary.questions
      .filter((question) => imageAnswerBlockTypes.has(question.blockType))
      .map((question) => question.id),
  );
  if (imageQuestionIds.size === 0) return [];
  const resultIdIndex = dataset.columns.findIndex(
    (column) => column.name === systemColumns.resultId,
  );
  const imageColumns = dataset.columns.flatMap((column, index) =>
    column.kind === "question" &&
    !column.isLabelColumn &&
    column.questionId &&
    imageQuestionIds.has(column.questionId)
      ? [{ name: column.name, index }]
      : [],
  );
  return dataset.rows.flatMap((row, rowIndex) => {
    const resultId = String(row[resultIdIndex] ?? rowIndex + 1);
    return imageColumns.flatMap(({ name, index }) => {
      const cell = row[index];
      if (typeof cell !== "string") return [];
      const urls = cell
        .split(",")
        .map((url) => url.trim())
        .filter((url) => /^https?:\/\//.test(url));
      return urls.map((url, urlIndex) => ({
        fileName: toSafeFileName(
          urls.length > 1
            ? `${resultId}_${name}_${urlIndex + 1}.jpg`
            : `${resultId}_${name}.jpg`,
        ),
        url,
      }));
    });
  });
};

const toSafeFileName = (fileName: string) => fileName.replace(/[^\w.-]+/g, "_");
