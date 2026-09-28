import { parseGroups } from "@typebot.io/groups/helpers/parseGroups";
import prisma from "@typebot.io/prisma";
import type { Prisma } from "@typebot.io/prisma/types";
import { variableSchema } from "@typebot.io/variables/schemas";
import { z } from "zod";
import { researchAnswerSchema } from "../schemas/answers";
import { resultSchema } from "../schemas/results";
import type { QuestionnaireVersion } from "./buildDatasetDictionary";
import type { ResearchResultInput } from "./buildResearchDataset";
import type { ResearchExportOptions } from "./schemas";

const RESULTS_BATCH_SIZE = 500;

/**
 * Loads the questionnaire versions and the interviews needed for a research export.
 * Typebots published before versioning (or never republished on MySQL) fall back
 * to the live published typebot, then to the draft.
 */
export const loadResearchExportData = async ({
  typebotId,
  options,
  createdAt,
  onProgress,
}: {
  typebotId: string;
  options: Pick<
    ResearchExportOptions,
    "versionNumbers" | "includePreVersioningResults" | "includeNotStarted"
  >;
  createdAt?: Prisma.Prisma.DateTimeFilter;
  onProgress?: (progress: { loaded: number; total: number }) => void;
}): Promise<{
  questionnaireVersions: (QuestionnaireVersion & { publishedAt?: Date })[];
  results: ResearchResultInput[];
}> => {
  const questionnaireVersions = await loadQuestionnaireVersions(
    typebotId,
    options.versionNumbers,
  );

  const where: Prisma.Prisma.ResultWhereInput = {
    typebotId,
    isArchived: false,
    hasStarted: options.includeNotStarted ? undefined : true,
    createdAt,
    ...(options.versionNumbers
      ? {
          OR: [
            { publishedVersionNumber: { in: options.versionNumbers } },
            ...(options.includePreVersioningResults
              ? [{ publishedVersionNumber: null }]
              : []),
          ],
        }
      : {}),
  };

  const total = await prisma.result.count({ where });
  const results: ResearchResultInput[] = [];
  let cursorId: string | undefined;
  do {
    const batch = await prisma.result.findMany({
      where,
      take: RESULTS_BATCH_SIZE,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      include: {
        answersV2: {
          select: {
            blockId: true,
            content: true,
            createdAt: true,
            executionIndex: true,
            value: true,
            valueLabel: true,
          },
          orderBy: { id: "asc" },
        },
        answers: {
          select: { blockId: true, content: true, createdAt: true },
        },
      },
    });
    for (const result of batch)
      results.push({
        ...resultSchema.parse(result),
        answers: z
          .array(researchAnswerSchema)
          .parse([...result.answers, ...result.answersV2]),
      });
    cursorId =
      batch.length === RESULTS_BATCH_SIZE
        ? batch[batch.length - 1]?.id
        : undefined;
    onProgress?.({ loaded: results.length, total });
  } while (cursorId);

  return { questionnaireVersions, results };
};

const loadQuestionnaireVersions = async (
  typebotId: string,
  versionNumbers: number[] | undefined,
): Promise<(QuestionnaireVersion & { publishedAt?: Date })[]> => {
  const versions = await prisma.publicTypebotVersion.findMany({
    where: {
      typebotId,
      versionNumber: versionNumbers ? { in: versionNumbers } : undefined,
    },
    orderBy: { versionNumber: "asc" },
    select: {
      id: true,
      versionNumber: true,
      publishedAt: true,
      schemaVersion: true,
      groups: true,
      variables: true,
    },
  });
  if (versions.length > 0)
    return versions.map((version) => ({
      versionId: version.id,
      versionNumber: version.versionNumber,
      publishedAt: version.publishedAt,
      groups: parseGroups(version.groups, {
        typebotVersion: version.schemaVersion,
      }),
      variables: z.array(variableSchema).parse(version.variables),
    }));

  const fallbackTypebot =
    (await prisma.publicTypebot.findUnique({
      where: { typebotId },
      select: { version: true, groups: true, variables: true },
    })) ??
    (await prisma.typebot.findUnique({
      where: { id: typebotId },
      select: { version: true, groups: true, variables: true },
    }));
  if (!fallbackTypebot) return [];
  return [
    {
      versionId: null,
      versionNumber: null,
      groups: parseGroups(fallbackTypebot.groups, {
        typebotVersion: fallbackTypebot.version,
      }),
      variables: z.array(variableSchema).parse(fallbackTypebot.variables),
    },
  ];
};
