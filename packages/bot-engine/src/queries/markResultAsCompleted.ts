import prisma from "@typebot.io/prisma";

/**
 * Sets the interview completion timestamp once.
 * Later saves of an already completed result never move END_TS.
 */
export const markResultAsCompleted = ({
  resultId,
  completedAt,
}: {
  resultId: string;
  completedAt: Date;
}) =>
  prisma.result.updateMany({
    where: { id: resultId, completedAt: null },
    data: { completedAt },
  });
