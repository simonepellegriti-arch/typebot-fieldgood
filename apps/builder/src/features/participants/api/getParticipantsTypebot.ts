import { ORPCError } from "@orpc/server";
import prisma from "@typebot.io/prisma";
import { isReadTypebotForbidden } from "@typebot.io/typebot/helpers/isReadTypebotForbidden";
import type { User } from "@typebot.io/user/schemas";
import { isWriteTypebotForbidden } from "@/features/typebot/helpers/isWriteTypebotForbidden";

/** The bot of a respondent list, if the user may read it (or edit it with mode "write"). */
export const getParticipantsTypebot = async (
  typebotId: string,
  user: Pick<User, "id" | "email">,
  mode: "read" | "write",
) => {
  const typebot = await prisma.typebot.findUnique({
    where: { id: typebotId },
    select: {
      id: true,
      name: true,
      publicId: true,
      customDomain: true,
      groups: true,
      variables: true,
      collaborators: { select: { userId: true, type: true } },
      workspace: {
        select: {
          isSuspended: true,
          isPastDue: true,
          members: { select: { userId: true, role: true } },
        },
      },
    },
  });
  const isForbidden =
    !typebot ||
    (mode === "write"
      ? await isWriteTypebotForbidden(typebot, user)
      : await isReadTypebotForbidden(typebot, user));
  if (!typebot || isForbidden)
    throw new ORPCError("NOT_FOUND", { message: "Typebot not found" });
  return typebot;
};
