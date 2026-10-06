import { participantPanelColumnsSchema } from "@typebot.io/bot-engine/participants/schemas";
import prisma from "@typebot.io/prisma";
import type { User } from "@typebot.io/user/schemas";
import { z } from "zod";
import { getParticipantsTypebot } from "./getParticipantsTypebot";

export const updateParticipantPanelInputSchema = z.object({
  typebotId: z.string(),
  columns: participantPanelColumnsSchema,
});

/** Changes which list columns feed which variables, and whether the personal link is required. */
export const handleUpdateParticipantPanel = async ({
  input: { typebotId, columns },
  context: { user },
}: {
  input: z.infer<typeof updateParticipantPanelInputSchema>;
  context: { user: Pick<User, "id" | "email"> };
}) => {
  await getParticipantsTypebot(typebotId, user, "write");
  await prisma.participantPanel.upsert({
    where: { typebotId },
    create: { typebotId, columns },
    update: { columns },
  });
  return { success: true };
};
