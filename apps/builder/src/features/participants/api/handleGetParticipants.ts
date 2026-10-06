import {
  parseParticipantAirtable,
  parseParticipantPanelColumns,
  participantRowSchema,
} from "@typebot.io/bot-engine/participants/schemas";
import prisma from "@typebot.io/prisma";
import type { User } from "@typebot.io/user/schemas";
import { z } from "zod";
import { getParticipantLink } from "../helpers/getParticipantLink";
import { getParticipantsTypebot } from "./getParticipantsTypebot";

export const getParticipantsInputSchema = z.object({ typebotId: z.string() });

/** The respondent list of a bot: settings, Airtable status and every participant with its link. */
export const handleGetParticipants = async ({
  input: { typebotId },
  context: { user },
}: {
  input: z.infer<typeof getParticipantsInputSchema>;
  context: { user: Pick<User, "id" | "email"> };
}) => {
  const typebot = await getParticipantsTypebot(typebotId, user, "read");
  const [panel, participants] = await Promise.all([
    prisma.participantPanel.findUnique({
      where: { typebotId },
      select: {
        idColumn: true,
        columns: true,
        airtable: true,
        airtableTokenData: true,
      },
    }),
    prisma.participant.findMany({
      where: { typebotId },
      // Rows of one upload share their creation time: then by ID.
      orderBy: [{ createdAt: "asc" }, { externalId: "asc" }],
      take: 10_000,
      select: {
        id: true,
        token: true,
        externalId: true,
        data: true,
        status: true,
        checkpoint: true,
        startedAt: true,
        completedAt: true,
        lastActivityAt: true,
        airtableRecordId: true,
      },
    }),
  ]);
  const airtable = parseParticipantAirtable(panel?.airtable);
  return {
    panel: panel
      ? {
          idColumn: panel.idColumn,
          columns: parseParticipantPanelColumns(panel.columns),
          airtable: airtable
            ? {
                baseId: airtable.baseId,
                tableId: airtable.tableId,
                tableName: airtable.tableName ?? null,
                fieldNames: airtable.fieldNames,
                hasToken: Boolean(panel.airtableTokenData),
              }
            : null,
        }
      : null,
    participants: participants.map((participant) => ({
      ...participant,
      data: participantRowSchema.safeParse(participant.data).data ?? {},
      link: getParticipantLink(typebot, participant.token),
    })),
  };
};
