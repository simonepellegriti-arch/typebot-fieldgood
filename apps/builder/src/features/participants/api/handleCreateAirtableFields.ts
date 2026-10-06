import { ORPCError } from "@orpc/server";
import {
  createAirtableField,
  getAirtableTable,
} from "@typebot.io/bot-engine/participants/airtableClient";
import { airtableStandardFields } from "@typebot.io/bot-engine/participants/schemas";
import prisma from "@typebot.io/prisma";
import type { User } from "@typebot.io/user/schemas";
import { z } from "zod";
import { getAnswerVariableNames } from "../helpers/getAnswerVariableNames";
import { getParticipantsTypebot } from "./getParticipantsTypebot";
import { getPanelAirtable } from "./sendParticipantsToAirtable";

export const createAirtableFieldsInputSchema = z.object({
  typebotId: z.string(),
});

/**
 * Columns the dashboard needs: ID, link, status, checkpoint, last activity,
 * the list columns and one per answer of the bot. Missing ones are created
 * (the token needs the schema.bases:write scope); returns those it couldn't.
 */
export const handleCreateAirtableFields = async ({
  input: { typebotId },
  context: { user },
}: {
  input: z.infer<typeof createAirtableFieldsInputSchema>;
  context: { user: Pick<User, "id" | "email"> };
}) => {
  const typebot = await getParticipantsTypebot(typebotId, user, "write");
  const connection = await getPanelAirtable(typebotId);
  if (!connection)
    throw new ORPCError("BAD_REQUEST", { message: "Airtable non collegato" });
  const { token, airtable, columns } = connection;
  const mappedVariableNames = new Set(
    columns.mappings.flatMap((mapping) =>
      mapping.variableName ? [mapping.variableName] : [],
    ),
  );
  const wantedFields = [
    ...new Set([
      ...Object.values(airtableStandardFields),
      ...columns.mappings.map((mapping) => mapping.column),
      ...getAnswerVariableNames(typebot.groups, typebot.variables).filter(
        (name) => !mappedVariableNames.has(name),
      ),
    ]),
  ];
  const table = await getAirtableTable(token, {
    baseId: airtable.baseId,
    table: airtable.tableId,
  });
  const existing = new Set(table.fieldNames.map((name) => name.toLowerCase()));
  const missing = wantedFields.filter(
    (name) => !existing.has(name.toLowerCase()),
  );
  const failed: { name: string; error: string }[] = [];
  for (const name of missing) {
    try {
      await createAirtableField(token, {
        baseId: airtable.baseId,
        tableId: table.id,
        name,
      });
    } catch (error) {
      failed.push({
        name,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    await new Promise((resolve) => setTimeout(resolve, 220));
  }
  const refreshed = await getAirtableTable(token, {
    baseId: airtable.baseId,
    table: table.id,
  });
  await prisma.participantPanel.update({
    where: { typebotId },
    data: { airtable: { ...airtable, fieldNames: refreshed.fieldNames } },
  });
  return {
    createdCount: missing.length - failed.length,
    failed,
    fieldNames: refreshed.fieldNames,
  };
};
