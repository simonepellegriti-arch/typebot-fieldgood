import { createAirtableRecords } from "@typebot.io/bot-engine/participants/airtableClient";
import {
  airtableStandardFields,
  airtableTokenSchema,
  parseParticipantAirtable,
  parseParticipantPanelColumns,
  participantRowSchema,
  participantStatuses,
  participantStatusLabels,
} from "@typebot.io/bot-engine/participants/schemas";
import { decrypt } from "@typebot.io/credentials/decrypt";
import prisma from "@typebot.io/prisma";
import { getParticipantLink } from "../helpers/getParticipantLink";

/** Airtable settings of a list with the decrypted token, if connected. */
export const getPanelAirtable = async (typebotId: string) => {
  const panel = await prisma.participantPanel.findUnique({
    where: { typebotId },
    select: {
      columns: true,
      airtable: true,
      airtableTokenData: true,
      airtableTokenIv: true,
    },
  });
  const airtable = parseParticipantAirtable(panel?.airtable);
  if (!panel?.airtableTokenData || !panel.airtableTokenIv || !airtable)
    return undefined;
  const { token } = airtableTokenSchema.parse(
    await decrypt(panel.airtableTokenData, panel.airtableTokenIv),
  );
  return {
    token,
    airtable,
    columns: parseParticipantPanelColumns(panel.columns),
  };
};

/**
 * One Airtable record per participant not sent yet: ID, personal link,
 * status and the list columns (only fields that exist in the table).
 */
export const sendParticipantsToAirtable = async (typebot: {
  id: string;
  name: string;
  publicId: string | null;
  customDomain: string | null;
}) => {
  const connection = await getPanelAirtable(typebot.id);
  if (!connection) return { sentCount: 0 };
  const { token, airtable } = connection;
  const participants = await prisma.participant.findMany({
    where: { typebotId: typebot.id, airtableRecordId: null },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      token: true,
      externalId: true,
      data: true,
      status: true,
    },
  });
  if (participants.length === 0) return { sentCount: 0 };
  const fieldNames = new Set(airtable.fieldNames);
  const keepExisting = (fields: Record<string, string>) =>
    Object.fromEntries(
      Object.entries(fields).filter(([name]) => fieldNames.has(name)),
    );
  const records = participants.map((participant) => {
    const row = participantRowSchema.safeParse(participant.data).data ?? {};
    const status =
      participantStatuses.find(
        (candidate) => candidate === participant.status,
      ) ?? "NOT_STARTED";
    return keepExisting({
      ...Object.fromEntries(
        Object.entries(row).map(([column, value]) => [
          column,
          String(value ?? ""),
        ]),
      ),
      [airtableStandardFields.id]: participant.externalId ?? participant.token,
      [airtableStandardFields.link]: getParticipantLink(
        typebot,
        participant.token,
      ),
      [airtableStandardFields.status]: participantStatusLabels[status],
    });
  });
  // Saved batch by batch: a failure halfway never creates duplicates on retry.
  let sentCount = 0;
  for (let start = 0; start < participants.length; start += 10) {
    const batch = participants.slice(start, start + 10);
    const recordIds = await createAirtableRecords(
      token,
      { baseId: airtable.baseId, tableId: airtable.tableId },
      records.slice(start, start + 10),
    );
    await prisma.$transaction(
      batch.flatMap((participant, index) => {
        const airtableRecordId = recordIds[index];
        return airtableRecordId
          ? [
              prisma.participant.update({
                where: { id: participant.id },
                data: { airtableRecordId },
              }),
            ]
          : [];
      }),
    );
    sentCount += recordIds.length;
    // Airtable allows 5 requests per second per base.
    await new Promise((resolve) => setTimeout(resolve, 220));
  }
  return { sentCount };
};
