import { buildCodebook, type Codebook } from "./buildCodebook";
import {
  buildDatasetDictionary,
  type QuestionnaireVersion,
} from "./buildDatasetDictionary";
import {
  buildResearchDataset,
  type ResearchResultInput,
} from "./buildResearchDataset";
import type {
  ResearchExportOptions,
  ResearchExportOptionsInput,
} from "./schemas";
import { researchExportOptionsSchema } from "./schemas";
import { serializeDatasetToCsv } from "./serializeDatasetToCsv";

/**
 * builder → publish (versions) → answers → dataset → CSV + SPSS-ready codebook.
 * Pure function: loading versions and results is the caller's responsibility.
 */
export const exportResearchDataset = ({
  questionnaireVersions,
  results,
  options: rawOptions,
  now = new Date(),
}: {
  questionnaireVersions: (QuestionnaireVersion & { publishedAt?: Date })[];
  results: ResearchResultInput[];
  options: ResearchExportOptionsInput | ResearchExportOptions;
  now?: Date;
}): { csv: string; codebook: Codebook; rowCount: number } => {
  const options = researchExportOptionsSchema.parse(rawOptions);
  const dictionary = buildDatasetDictionary(questionnaireVersions);
  const dataset = buildResearchDataset({ dictionary, results, options, now });
  return {
    csv: serializeDatasetToCsv(dataset, { mode: options.csvMode }),
    codebook: buildCodebook({
      dataset,
      dictionary: dataset.dictionary,
      options,
      questionnaireVersions: questionnaireVersions.flatMap((version) =>
        version.versionNumber !== null && version.versionId
          ? [
              {
                versionNumber: version.versionNumber,
                versionId: version.versionId,
                publishedAt: (version.publishedAt ?? now).toISOString(),
              },
            ]
          : [],
      ),
      now,
    }),
    rowCount: dataset.rows.length,
  };
};
