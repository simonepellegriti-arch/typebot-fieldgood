import { participantLinkParameter } from "@typebot.io/bot-engine/participants/schemas";
import { env } from "@typebot.io/env";
import { getPublicId } from "@typebot.io/typebot/helpers/getPublicId";

/** Personal link of a respondent: the bot's public URL with its token. */
export const getParticipantLink = (
  typebot: {
    id: string;
    name: string;
    publicId: string | null;
    customDomain: string | null;
  },
  token: string,
) => {
  const baseUrl = typebot.customDomain
    ? `https://${typebot.customDomain}`
    : `${env.NEXT_PUBLIC_VIEWER_URL[0]}/${getPublicId(typebot)}`;
  return `${baseUrl}?${participantLinkParameter}=${token}`;
};
