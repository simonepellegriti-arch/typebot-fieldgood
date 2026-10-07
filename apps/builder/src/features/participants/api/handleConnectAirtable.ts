import { ORPCError } from "@orpc/server";
import {
  AirtableError,
  getAirtableTable,
} from "@typebot.io/bot-engine/participants/airtableClient";
import { airtableTokenSchema } from "@typebot.io/bot-engine/participants/schemas";
import { decrypt } from "@typebot.io/credentials/decrypt";
import { encrypt } from "@typebot.io/credentials/encrypt";
import prisma from "@typebot.io/prisma";
import type { User } from "@typebot.io/user/schemas";
import { z } from "zod";
import { getParticipantsTypebot } from "./getParticipantsTypebot";

export const connectAirtableInputSchema = z.object({
  typebotId: z.string(),
  /** Omitted: keep the saved token (changing base or table only). */
  token: z.string().trim().min(10).optional(),
  baseId: z
    .string()
    .trim()
    .regex(/^app[A-Za-z0-9]+$/),
  table: z.string().trim().min(1),
});

/**
 * Connects the list to an Airtable table (the client's dashboard): checks the
 * token can read it, saves the token encrypted and the table's fields.
 */
export const handleConnectAirtable = async ({
  input: { typebotId, token, baseId, table },
  context: { user },
}: {
  input: z.infer<typeof connectAirtableInputSchema>;
  context: { user: Pick<User, "id" | "email"> };
}) => {
  await getParticipantsTypebot(typebotId, user, "write");
  const panel = await prisma.participantPanel.findUnique({
    where: { typebotId },
    select: { airtableTokenData: true, airtableTokenIv: true },
  });
  const savedToken =
    panel?.airtableTokenData && panel.airtableTokenIv
      ? airtableTokenSchema.parse(
          await decrypt(panel.airtableTokenData, panel.airtableTokenIv),
        ).token
      : undefined;
  const accessToken = token ?? savedToken;
  if (!accessToken)
    throw new ORPCError("BAD_REQUEST", { message: "Token Airtable mancante" });

  const airtableTable = await getAirtableTable(accessToken, {
    baseId,
    table,
  }).catch((error) => {
    throw new ORPCError("BAD_REQUEST", {
      message:
        error instanceof AirtableError
          ? error.message
          : "Airtable non raggiungibile",
    });
  });

  const encryptedToken = token ? await encrypt({ token }) : undefined;
  const airtable = {
    baseId,
    tableId: airtableTable.id,
    tableName: airtableTable.name,
    fieldNames: airtableTable.fieldNames,
    primaryFieldName: airtableTable.primaryFieldName,
  };
  await prisma.participantPanel.upsert({
    where: { typebotId },
    create: {
      typebotId,
      columns: { mappings: [], isLinkRequired: true },
      airtable,
      airtableTokenData: encryptedToken?.encryptedData,
      airtableTokenIv: encryptedToken?.iv,
    },
    update: {
      airtable,
      ...(encryptedToken
        ? {
            airtableTokenData: encryptedToken.encryptedData,
            airtableTokenIv: encryptedToken.iv,
          }
        : {}),
    },
  });
  return {
    tableName: airtableTable.name,
    fieldNames: airtableTable.fieldNames,
    primaryFieldName: airtableTable.primaryFieldName,
  };
};
