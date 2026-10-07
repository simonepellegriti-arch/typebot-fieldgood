import { ORPCError } from "@orpc/server";
import {
  createAirtableField,
  getAirtableTable,
  listAirtableRecords,
  updateAirtableRecords,
} from "@typebot.io/bot-engine/participants/airtableClient";
import {
  linkedTableStandardFieldNames,
  participantStatuses,
  participantStatusLabels,
} from "@typebot.io/bot-engine/participants/schemas";
import prisma from "@typebot.io/prisma";
import type { User } from "@typebot.io/user/schemas";
import { z } from "zod";
import { generateParticipantToken } from "../helpers/generateParticipantToken";
import { getParticipantLink } from "../helpers/getParticipantLink";
import { getParticipantsTypebot } from "./getParticipantsTypebot";
import { getPanelAirtable } from "./sendParticipantsToAirtable";

export const importAirtableViewInputSchema = z.object({
  typebotId: z.string(),
  view: z.string().trim().min(1),
  /** Fields of the records passed to the bot as variables (e.g. Nome). */
  variableFields: z.array(z.string().trim().min(1)).max(20),
});

/**
 * Participants from the records of a view of the connected table (e.g. the
 * recruitment table): each record gets a personal link, written into the
 * "Link Chatbot" field, and the bot's answers go into that same record.
 * Records already imported are skipped, so the import can be repeated when
 * the view grows.
 */
export const handleImportAirtableView = async ({
  input: { typebotId, view, variableFields },
  context: { user },
}: {
  input: z.infer<typeof importAirtableViewInputSchema>;
  context: { user: Pick<User, "id" | "email"> };
}) => {
  const typebot = await getParticipantsTypebot(typebotId, user, "write");
  const connection = await getPanelAirtable(typebotId);
  if (!connection)
    throw new ORPCError("BAD_REQUEST", { message: "Airtable non collegato" });
  const { token, airtable } = connection;
  const table = await getAirtableTable(token, {
    baseId: airtable.baseId,
    table: airtable.tableId,
  });
  const missingFields = variableFields.filter(
    (name) => !table.fieldNames.includes(name),
  );
  if (missingFields.length > 0)
    throw new ORPCError("BAD_REQUEST", {
      message: `Campi non presenti nella tabella: ${missingFields.join(", ")}`,
    });

  const records = await listAirtableRecords(token, {
    baseId: airtable.baseId,
    tableId: table.id,
    view,
    fieldNames:
      variableFields.length > 0
        ? variableFields
        : table.primaryFieldName
          ? [table.primaryFieldName]
          : [],
  });
  const alreadyImported = new Set(
    (
      await prisma.participant.findMany({
        where: { typebotId, airtableRecordId: { not: null } },
        select: { airtableRecordId: true },
      })
    ).flatMap((participant) => participant.airtableRecordId ?? []),
  );
  const newParticipants = records
    .filter((record) => !alreadyImported.has(record.id))
    .map((record) => ({
      typebotId,
      token: generateParticipantToken(),
      externalId: record.id,
      airtableRecordId: record.id,
      data: {
        ID: record.id,
        ...Object.fromEntries(
          variableFields.map((name) => [name, textOf(record.fields[name])]),
        ),
      },
    }));
  await prisma.participant.createMany({ data: newParticipants });

  // List columns become bot variables with the same name (Nome → {{Nome}}).
  const variableNames = new Set(
    (
      z.array(z.object({ name: z.string() })).safeParse(typebot.variables)
        .data ?? []
    ).map((variable) => variable.name),
  );
  const columns = {
    mappings: [
      { column: "ID", variableName: null },
      ...variableFields.map((name) => ({
        column: name,
        variableName: variableNames.has(name) ? name : null,
      })),
    ],
    isLinkRequired: true,
  };
  const linkedAirtable = {
    ...airtable,
    tableId: table.id,
    linkedView: view,
    standardFieldNames: linkedTableStandardFieldNames,
  };
  await prisma.participantPanel.update({
    where: { typebotId },
    data: { idColumn: "ID", columns, airtable: linkedAirtable },
  });

  // The personal link goes into the record, ready to be sent.
  if (!table.fieldNames.includes(linkedTableStandardFieldNames.link))
    await createAirtableField(token, {
      baseId: airtable.baseId,
      tableId: table.id,
      name: linkedTableStandardFieldNames.link,
    });
  if (!table.fieldNames.includes(linkedTableStandardFieldNames.status))
    await createAirtableField(token, {
      baseId: airtable.baseId,
      tableId: table.id,
      name: linkedTableStandardFieldNames.status,
    });
  // Written for every record of the view, so a repeated import repairs a
  // previous one that stopped halfway.
  const viewRecordIds = new Set(records.map((record) => record.id));
  const viewParticipants = (
    await prisma.participant.findMany({
      where: { typebotId, airtableRecordId: { not: null } },
      select: { token: true, status: true, airtableRecordId: true },
    })
  ).filter((participant) =>
    viewRecordIds.has(participant.airtableRecordId ?? ""),
  );
  await updateAirtableRecords(
    token,
    { baseId: airtable.baseId, tableId: table.id },
    viewParticipants.map((participant) => ({
      id: participant.airtableRecordId ?? "",
      fields: {
        [linkedTableStandardFieldNames.link]: getParticipantLink(
          typebot,
          participant.token,
        ),
        [linkedTableStandardFieldNames.status]:
          participantStatusLabels[
            participantStatuses.find(
              (status) => status === participant.status,
            ) ?? "NOT_STARTED"
          ],
      },
    })),
  );
  const refreshed = await getAirtableTable(token, {
    baseId: airtable.baseId,
    table: table.id,
  });
  await prisma.participantPanel.update({
    where: { typebotId },
    data: {
      airtable: {
        ...linkedAirtable,
        fieldNames: refreshed.fieldNames,
        primaryFieldName: refreshed.primaryFieldName,
      },
    },
  });
  return {
    importedCount: newParticipants.length,
    skippedCount: records.length - newParticipants.length,
  };
};

const textOf = (value: unknown) =>
  value === undefined || value === null
    ? ""
    : Array.isArray(value)
      ? value.map(String).join(", ")
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value);
