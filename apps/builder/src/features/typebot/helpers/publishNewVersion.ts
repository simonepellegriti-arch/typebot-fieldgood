import prisma from "@typebot.io/prisma";
import { PrismaClientKnownRequestError } from "@typebot.io/prisma/enum";
import type { Prisma } from "@typebot.io/prisma/types";

type PublishedSnapshot = {
  edges: Prisma.Prisma.InputJsonValue;
  groups: Prisma.Prisma.InputJsonValue;
  events?: Prisma.Prisma.InputJsonValue;
  settings: Prisma.Prisma.InputJsonValue;
  variables: Prisma.Prisma.InputJsonValue;
  theme: Prisma.Prisma.InputJsonValue;
};

/**
 * Creates an immutable questionnaire version and points the live published typebot to it.
 * Versions are never updated: interviews keep referencing the version they started with.
 */
export const publishNewVersion = async ({
  typebotId,
  schemaVersion,
  publishedById,
  publishedTypebotId,
  snapshot,
  remainingAttempts = 2,
}: {
  typebotId: string;
  schemaVersion: string | null;
  publishedById: string;
  publishedTypebotId: string | undefined;
  snapshot: PublishedSnapshot;
  remainingAttempts?: number;
}): Promise<{ id: string; versionNumber: number; publishedAt: Date }> => {
  try {
    return await prisma.$transaction(async (transaction) => {
      const latestVersion = await transaction.publicTypebotVersion.findFirst({
        where: { typebotId },
        orderBy: { versionNumber: "desc" },
        select: { versionNumber: true },
      });
      const newVersion = await transaction.publicTypebotVersion.create({
        data: {
          ...snapshot,
          typebotId,
          versionNumber: (latestVersion?.versionNumber ?? 0) + 1,
          schemaVersion,
          publishedById,
        },
        select: { id: true, versionNumber: true, publishedAt: true },
      });
      const liveTypebotData = {
        ...snapshot,
        version: schemaVersion,
        currentVersionId: newVersion.id,
        currentVersionNumber: newVersion.versionNumber,
      };
      if (publishedTypebotId)
        await transaction.publicTypebot.updateMany({
          where: { id: publishedTypebotId },
          data: { ...liveTypebotData, updatedAt: new Date() },
        });
      else
        await transaction.publicTypebot.createMany({
          data: { ...liveTypebotData, typebotId },
        });
      return newVersion;
    });
  } catch (error) {
    const isVersionNumberConflict =
      error instanceof PrismaClientKnownRequestError && error.code === "P2002";
    if (isVersionNumberConflict && remainingAttempts > 1)
      return publishNewVersion({
        typebotId,
        schemaVersion,
        publishedById,
        publishedTypebotId,
        snapshot,
        remainingAttempts: remainingAttempts - 1,
      });
    throw error;
  }
};
