import { ORPCError } from "@orpc/server";
import type { User } from "@typebot.io/user/schemas";
import { z } from "zod";
import { getParticipantsTypebot } from "./getParticipantsTypebot";
import { sendParticipantsToAirtable } from "./sendParticipantsToAirtable";

export const sendParticipantsToAirtableInputSchema = z.object({
  typebotId: z.string(),
});

/** Creates the Airtable records of the participants that don't have one yet. */
export const handleSendParticipantsToAirtable = async ({
  input: { typebotId },
  context: { user },
}: {
  input: z.infer<typeof sendParticipantsToAirtableInputSchema>;
  context: { user: Pick<User, "id" | "email"> };
}) => {
  const typebot = await getParticipantsTypebot(typebotId, user, "write");
  try {
    return await sendParticipantsToAirtable(typebot);
  } catch (error) {
    throw new ORPCError("BAD_REQUEST", {
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
