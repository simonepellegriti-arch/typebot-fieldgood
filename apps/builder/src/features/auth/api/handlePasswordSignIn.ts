import { randomBytes } from "node:crypto";
import { verifyPassword } from "@typebot.io/auth/helpers/verifyPassword";
import { env } from "@typebot.io/env";
import prisma from "@typebot.io/prisma";
import { z } from "zod";
import { isSameOriginRequest } from "../helpers/isSameOriginRequest";

const sessionMaxAgeSeconds = 30 * 24 * 60 * 60;
const maxFailedAttempts = 10;
const lockMinutes = 15;

const bodySchema = z.object({
  identifier: z.string().trim().min(1).max(320),
  password: z.string().min(1).max(256),
});

/**
 * Email (or unique name) + password sign-in. Creates a database session like
 * the other sign-in methods, so the rest of the app is unchanged.
 */
export const handlePasswordSignIn = async (request: Request) => {
  if (!isSameOriginRequest(request.headers, env.NEXTAUTH_URL))
    return Response.json({ error: "forbidden" }, { status: 403 });
  const parsedBody = bodySchema.safeParse(
    await request.json().catch(() => undefined),
  );
  if (!parsedBody.success)
    return Response.json({ error: "invalid-credentials" }, { status: 400 });
  const { identifier, password } = parsedBody.data;

  const throttleIdentifier = `password-signin-failures:${identifier.toLowerCase()}`;
  const throttle = await prisma.verificationToken.findFirst({
    where: { identifier: throttleIdentifier },
  });
  if (
    throttle &&
    throttle.expires > new Date() &&
    throttle.failedAttempts >= maxFailedAttempts
  )
    return Response.json({ error: "too-many-attempts" }, { status: 429 });

  const user = await findUserByIdentifier(identifier);
  const isPasswordValid =
    user?.password?.hash !== undefined &&
    (await verifyPassword(password, user.password.hash));
  if (!user || !isPasswordValid) {
    await recordFailedAttempt(throttleIdentifier, throttle);
    return Response.json({ error: "invalid-credentials" }, { status: 401 });
  }
  if (throttle)
    await prisma.verificationToken.deleteMany({
      where: { identifier: throttleIdentifier },
    });

  const sessionToken = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + sessionMaxAgeSeconds * 1000);
  await prisma.$transaction([
    prisma.session.create({
      data: { sessionToken, userId: user.id, expires },
    }),
    prisma.user.update({
      where: { id: user.id },
      data: { lastActivityAt: new Date() },
    }),
  ]);

  const isSecure = new URL(env.NEXTAUTH_URL).protocol === "https:";
  const cookieName = `${isSecure ? "__Secure-" : ""}authjs.session-token`;
  const response = Response.json({ ok: true });
  response.headers.append(
    "Set-Cookie",
    [
      `${cookieName}=${sessionToken}`,
      "Path=/",
      `Expires=${expires.toUTCString()}`,
      "HttpOnly",
      "SameSite=Lax",
      isSecure ? "Secure" : undefined,
    ]
      .filter(Boolean)
      .join("; "),
  );
  return response;
};

/** Email (case-insensitive) or, without "@", a name shared by no other user. */
const findUserByIdentifier = async (identifier: string) => {
  const select = { id: true, password: { select: { hash: true } } } as const;
  if (identifier.includes("@"))
    return prisma.user.findFirst({
      where: { email: { equals: identifier, mode: "insensitive" } },
      select,
    });
  const users = await prisma.user.findMany({
    where: { name: { equals: identifier, mode: "insensitive" } },
    select,
    take: 2,
  });
  return users.length === 1 ? users[0] : undefined;
};

const recordFailedAttempt = async (
  identifier: string,
  throttle: { failedAttempts: number; expires: Date; token: string } | null,
) => {
  const isThrottleActive = throttle && throttle.expires > new Date();
  if (throttle && isThrottleActive)
    return prisma.verificationToken.update({
      where: { token: throttle.token },
      data: { failedAttempts: { increment: 1 } },
    });
  await prisma.verificationToken.deleteMany({ where: { identifier } });
  return prisma.verificationToken.create({
    data: {
      identifier,
      token: randomBytes(16).toString("hex"),
      failedAttempts: 1,
      expires: new Date(Date.now() + lockMinutes * 60 * 1000),
    },
  });
};
