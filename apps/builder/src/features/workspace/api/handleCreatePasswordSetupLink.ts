import { ORPCError } from "@orpc/server";
import { createPasswordSetupToken } from "@typebot.io/auth/helpers/passwordSetupTokens";
import gentleRateLimiter from "@typebot.io/auth/lib/gentleRateLimiter";
import { sendPasswordSetupEmail } from "@typebot.io/emails/transactional/PasswordSetupEmail";
import { env } from "@typebot.io/env";
import prisma from "@typebot.io/prisma";
import { WorkspaceRole } from "@typebot.io/prisma/enum";
import type { User } from "@typebot.io/user/schemas";
import { z } from "zod";

export const createPasswordSetupLinkInputSchema = z.object({
  workspaceId: z.string(),
  email: z.string().email(),
  /** Also send the link by email (when an SMTP server is configured). */
  sendEmail: z.boolean(),
});

/**
 * Link to create (new member) or reset (existing member) a FIELDBOT password.
 * Only admins of a workspace, for people invited to it or members of it.
 */
export const handleCreatePasswordSetupLink = async ({
  input: { workspaceId, email, sendEmail },
  context: { user },
}: {
  input: z.infer<typeof createPasswordSetupLinkInputSchema>;
  context: { user: Pick<User, "id" | "email"> };
}) => {
  if (gentleRateLimiter) {
    const { success } = await gentleRateLimiter.limit(user.id);
    if (!success) throw new ORPCError("TOO_MANY_REQUESTS");
  }
  const normalizedEmail = email.trim().toLowerCase();
  const workspace = await prisma.workspace.findFirst({
    where: {
      id: workspaceId,
      members: { some: { userId: user.id, role: WorkspaceRole.ADMIN } },
    },
    select: {
      name: true,
      invitations: {
        where: { email: { equals: normalizedEmail, mode: "insensitive" } },
        select: { email: true },
      },
      members: {
        where: {
          user: { email: { equals: normalizedEmail, mode: "insensitive" } },
        },
        select: { user: { select: { email: true } } },
      },
    },
  });
  if (!workspace)
    throw new ORPCError("FORBIDDEN", {
      message: "Only workspace admins can send access links",
    });
  // Email as saved (same case as the invitation the new user will join).
  const targetEmail =
    workspace.members[0]?.user.email ?? workspace.invitations[0]?.email;
  if (!targetEmail)
    throw new ORPCError("BAD_REQUEST", {
      message: "This email is not a member of the workspace",
    });

  const token = await createPasswordSetupToken(targetEmail);
  const url = `${env.NEXTAUTH_URL}/set-password?token=${token}`;
  const isEmailConfigured = Boolean(env.SMTP_HOST && env.NEXT_PUBLIC_SMTP_FROM);
  let isEmailSent = false;
  if (sendEmail && isEmailConfigured) {
    try {
      await sendPasswordSetupEmail({
        url,
        email: targetEmail,
        workspaceName: workspace.name,
        hostEmail: user.email ?? "",
        isNewUser: workspace.members.length === 0,
      });
      isEmailSent = true;
    } catch (error) {
      console.error("Could not send the password setup email", error);
    }
  }
  return { url, isEmailConfigured, isEmailSent };
};
