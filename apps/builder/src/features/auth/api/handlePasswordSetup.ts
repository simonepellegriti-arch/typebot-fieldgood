import { createAuthPrismaAdapter } from "@typebot.io/auth/helpers/createAuthPrismaAdapter";
import { hashPassword } from "@typebot.io/auth/helpers/hashPassword";
import { getPasswordProblem } from "@typebot.io/auth/helpers/passwordRules";
import {
  deletePasswordSetupToken,
  findPasswordSetupTokenEmail,
} from "@typebot.io/auth/helpers/passwordSetupTokens";
import { env } from "@typebot.io/env";
import prisma from "@typebot.io/prisma";
import { z } from "zod";
import { isSameOriginRequest } from "../helpers/isSameOriginRequest";

const bodySchema = z.object({
  token: z.string().min(10).max(200),
  password: z.string().max(256),
});

/**
 * POST: creates the password of the link's email. A person invited to a
 * workspace gets their user created (and joins the workspace) now. Existing
 * sessions are closed when a password is reset.
 */
export const handlePasswordSetup = async (request: Request) => {
  if (!isSameOriginRequest(request.headers, env.NEXTAUTH_URL))
    return Response.json({ error: "forbidden" }, { status: 403 });
  const parsedBody = bodySchema.safeParse(
    await request.json().catch(() => undefined),
  );
  if (!parsedBody.success)
    return Response.json({ error: "invalid-link" }, { status: 400 });
  const { token, password } = parsedBody.data;
  const passwordProblem = getPasswordProblem(password);
  if (passwordProblem)
    return Response.json({ error: passwordProblem }, { status: 400 });

  const email = await findPasswordSetupTokenEmail(token);
  if (!email) return Response.json({ error: "invalid-link" }, { status: 404 });

  const existingUser = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true },
  });
  const userId = existingUser?.id ?? (await createInvitedUser(email));

  const hash = await hashPassword(password);
  await prisma.$transaction([
    prisma.userPassword.upsert({
      where: { userId },
      create: { userId, hash },
      update: { hash },
    }),
    prisma.session.deleteMany({ where: { userId } }),
  ]);
  await deletePasswordSetupToken(token);
  return Response.json({ email });
};

/** Same creation as the other sign-in methods: joins the workspaces the email was invited to. */
const createInvitedUser = async (email: string) => {
  const { createUser } = createAuthPrismaAdapter(prisma);
  if (!createUser) throw new Error("The auth adapter can't create users");
  const user = await createUser({
    id: "",
    email,
    emailVerified: new Date(),
    name: null,
    image: null,
  });
  return user.id;
};
