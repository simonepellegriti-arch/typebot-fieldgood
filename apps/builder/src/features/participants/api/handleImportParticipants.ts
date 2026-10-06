import { participantPanelColumnsSchema } from "@typebot.io/bot-engine/participants/schemas";
import prisma from "@typebot.io/prisma";
import type { User } from "@typebot.io/user/schemas";
import { z } from "zod";
import { generateParticipantToken } from "../helpers/generateParticipantToken";
import { getParticipantsTypebot } from "./getParticipantsTypebot";
import { sendParticipantsToAirtable } from "./sendParticipantsToAirtable";

export const importParticipantsInputSchema = z.object({
  typebotId: z.string(),
  idColumn: z.string().nullable(),
  columns: participantPanelColumnsSchema,
  rows: z
    .array(z.record(z.string(), z.string().max(5_000)))
    .min(1)
    .max(10_000),
});

/**
 * Adds a respondent list: each row becomes a participant with its own link
 * token. Rows whose ID is already in the list update it (link unchanged).
 * When Airtable is connected the new participants get their record.
 */
export const handleImportParticipants = async ({
  input: { typebotId, idColumn, columns, rows },
  context: { user },
}: {
  input: z.infer<typeof importParticipantsInputSchema>;
  context: { user: Pick<User, "id" | "email"> };
}) => {
  const typebot = await getParticipantsTypebot(typebotId, user, "write");
  await prisma.participantPanel.upsert({
    where: { typebotId },
    create: { typebotId, idColumn, columns },
    update: { idColumn, columns },
  });

  const externalIdOf = (row: Record<string, string>) =>
    idColumn ? row[idColumn]?.trim() || null : null;
  const externalIds = rows.flatMap((row) => externalIdOf(row) ?? []);
  const existing = externalIds.length
    ? await prisma.participant.findMany({
        where: { typebotId, externalId: { in: externalIds } },
        select: { id: true, externalId: true },
      })
    : [];
  const existingIdByExternalId = new Map(
    existing.map((participant) => [participant.externalId, participant.id]),
  );

  const seenExternalIds = new Set<string>();
  const toCreate: {
    externalId: string | null;
    data: Record<string, string>;
  }[] = [];
  const toUpdate: { id: string; data: Record<string, string> }[] = [];
  let duplicateCount = 0;
  for (const row of rows) {
    const externalId = externalIdOf(row);
    if (externalId) {
      if (seenExternalIds.has(externalId)) {
        duplicateCount++;
        continue;
      }
      seenExternalIds.add(externalId);
      const existingId = existingIdByExternalId.get(externalId);
      if (existingId) {
        toUpdate.push({ id: existingId, data: row });
        continue;
      }
    }
    toCreate.push({ externalId, data: row });
  }

  await prisma.participant.createMany({
    data: toCreate.map((participant) => ({
      typebotId,
      token: generateParticipantToken(),
      externalId: participant.externalId,
      data: participant.data,
    })),
  });
  for (let start = 0; start < toUpdate.length; start += 200)
    await prisma.$transaction(
      toUpdate.slice(start, start + 200).map((participant) =>
        prisma.participant.update({
          where: { id: participant.id },
          data: { data: participant.data },
        }),
      ),
    );

  let airtableError: string | null = null;
  let sentToAirtableCount = 0;
  try {
    sentToAirtableCount = (await sendParticipantsToAirtable(typebot)).sentCount;
  } catch (error) {
    airtableError = error instanceof Error ? error.message : String(error);
  }

  return {
    createdCount: toCreate.length,
    updatedCount: toUpdate.length,
    duplicateCount,
    sentToAirtableCount,
    airtableError,
  };
};
