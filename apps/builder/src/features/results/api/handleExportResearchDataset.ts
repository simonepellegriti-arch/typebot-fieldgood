import { ORPCError } from "@orpc/server";
import prisma from "@typebot.io/prisma";
import { getExportFileName } from "@typebot.io/results/getExportFileName";
import { exportResearchDataset } from "@typebot.io/results/research/exportResearchDataset";
import { loadResearchExportData } from "@typebot.io/results/research/loadResearchExportData";
import { researchExportOptionsSchema } from "@typebot.io/results/research/schemas";
import {
  defaultTimeFilter,
  parseFromDateFromTimeFilter,
  parseToDateFromTimeFilter,
  timeFilterValues,
} from "@typebot.io/results/timeFilter";
import { isReadTypebotForbidden } from "@typebot.io/typebot/helpers/isReadTypebotForbidden";
import type { User } from "@typebot.io/user/schemas";
import { z } from "zod";

/** Above this size the export must go through the background workflow. */
export const MAX_SYNCHRONOUS_RESEARCH_EXPORT_RESULTS = 20_000;

export const exportResearchDatasetInputSchema = z.object({
  typebotId: z
    .string()
    .describe(
      "[Where to find my bot's ID?](../how-to#how-to-find-my-typebotid)",
    ),
  timeFilter: z.enum(timeFilterValues).default(defaultTimeFilter),
  timeZone: z.string().optional(),
  options: researchExportOptionsSchema.default(
    researchExportOptionsSchema.parse({}),
  ),
});

export const handleExportResearchDataset = async ({
  input: { typebotId, timeFilter, timeZone, options },
  context: { user },
}: {
  input: z.infer<typeof exportResearchDatasetInputSchema>;
  context: { user: Pick<User, "id" | "email"> };
}) => {
  const typebot = await prisma.typebot.findUnique({
    where: { id: typebotId },
    select: {
      id: true,
      name: true,
      publicId: true,
      collaborators: {
        where: { userId: user.id },
        select: { userId: true, type: true },
      },
      workspace: {
        select: {
          isSuspended: true,
          isPastDue: true,
          members: {
            where: { userId: user.id },
            select: { userId: true, role: true },
          },
        },
      },
    },
  });
  if (!typebot || (await isReadTypebotForbidden(typebot, user)))
    throw new ORPCError("NOT_FOUND", { message: "Typebot not found" });

  const fromDate = parseFromDateFromTimeFilter(timeFilter, timeZone);
  const toDate = parseToDateFromTimeFilter(timeFilter, timeZone);
  const exportOptions = {
    ...options,
    timeZone: options.timeZone ?? timeZone,
  };

  const totalResults = await prisma.result.count({
    where: {
      typebotId,
      isArchived: false,
      hasStarted: exportOptions.includeNotStarted ? undefined : true,
      createdAt: fromDate
        ? { gte: fromDate, lte: toDate ?? undefined }
        : undefined,
    },
  });
  if (totalResults > MAX_SYNCHRONOUS_RESEARCH_EXPORT_RESULTS)
    throw new ORPCError("BAD_REQUEST", {
      message: `Too many results (${totalResults}) for a direct export. Use the background export or narrow the time period.`,
    });

  const { questionnaireVersions, results } = await loadResearchExportData({
    typebotId,
    options: exportOptions,
    createdAt: fromDate
      ? { gte: fromDate, lte: toDate ?? undefined }
      : undefined,
  });

  const { csv, longCsv, sav, codebook, rowCount, imageFiles } =
    exportResearchDataset({
      questionnaireVersions,
      results,
      options: exportOptions,
      fileLabel: typebot.name,
    });

  const csvFileName = getExportFileName(typebot, timeFilter).replace(
    /\.csv$/,
    "-research.csv",
  );

  return {
    csvFileName,
    codebookFileName: csvFileName.replace(/\.csv$/, ".codebook.json"),
    savFileName: csvFileName.replace(/\.csv$/, ".sav"),
    csv,
    longCsvFileName: csvFileName.replace(/\.csv$/, "-long.csv"),
    longCsv,
    savBase64: sav ? Buffer.from(sav).toString("base64") : undefined,
    codebook: JSON.stringify(codebook, null, 2),
    rowCount,
    imageFiles,
    imagesZipFileName: csvFileName.replace(/\.csv$/, "-images.zip"),
  };
};
