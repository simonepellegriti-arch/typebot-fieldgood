import prisma from "@typebot.io/prisma";
import type { User } from "@typebot.io/user/schemas";
import { z } from "zod";
import { getParticipantsTypebot } from "./getParticipantsTypebot";

export const deleteParticipantsInputSchema = z.object({
  typebotId: z.string(),
  /** Omitted: the whole list. Results and Airtable records are kept. */
  participantIds: z.array(z.string()).optional(),
});

/** Removes participants (their links stop working); answers stay in Results. */
export const handleDeleteParticipants = async ({
  input: { typebotId, participantIds },
  context: { user },
}: {
  input: z.infer<typeof deleteParticipantsInputSchema>;
  context: { user: Pick<User, "id" | "email"> };
}) => {
  await getParticipantsTypebot(typebotId, user, "write");
  const { count } = await prisma.participant.deleteMany({
    where: {
      typebotId,
      ...(participantIds ? { id: { in: participantIds } } : {}),
    },
  });
  return { deletedCount: count };
};
