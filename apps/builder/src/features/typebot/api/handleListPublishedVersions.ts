import { ORPCError } from "@orpc/server";
import prisma from "@typebot.io/prisma";
import { isReadTypebotForbidden } from "@typebot.io/typebot/helpers/isReadTypebotForbidden";
import type { User } from "@typebot.io/user/schemas";
import { z } from "zod";

export const listPublishedVersionsInputSchema = z.object({
  typebotId: z
    .string()
    .describe(
      "[Where to find my bot's ID?](../how-to#how-to-find-my-typebotid)",
    ),
});

export const publishedVersionSummarySchema = z.object({
  id: z.string(),
  versionNumber: z.number(),
  publishedAt: z.date(),
  publishedById: z.string().nullable(),
  isCurrent: z.boolean(),
  totalResults: z.number(),
});

export const handleListPublishedVersions = async ({
  input: { typebotId },
  context: { user },
}: {
  input: z.infer<typeof listPublishedVersionsInputSchema>;
  context: { user: Pick<User, "id" | "email"> };
}) => {
  const typebot = await prisma.typebot.findUnique({
    where: { id: typebotId },
    select: {
      id: true,
      publishedTypebot: { select: { currentVersionId: true } },
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

  const [versions, resultsPerVersion] = await Promise.all([
    prisma.publicTypebotVersion.findMany({
      where: { typebotId },
      orderBy: { versionNumber: "desc" },
      select: {
        id: true,
        versionNumber: true,
        publishedAt: true,
        publishedById: true,
      },
    }),
    prisma.result.groupBy({
      by: ["publishedVersionNumber"],
      where: { typebotId, hasStarted: true, isArchived: false },
      _count: { _all: true },
    }),
  ]);

  return {
    versions: versions.map((version) => ({
      ...version,
      isCurrent: version.id === typebot.publishedTypebot?.currentVersionId,
      totalResults:
        resultsPerVersion.find(
          (group) => group.publishedVersionNumber === version.versionNumber,
        )?._count._all ?? 0,
    })),
  };
};
