import { createHash, randomBytes } from "node:crypto";
import prisma from "@typebot.io/prisma";

const identifierPrefix = "password-setup:";
export const passwordSetupTokenMaxAgeDays = 7;

const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");

/**
 * One-time link token to create / reset a password. Only its hash is stored
 * (VerificationToken table); a new link invalidates the previous ones.
 */
export const createPasswordSetupToken = async (email: string) => {
  const trimmedEmail = email.trim();
  const token = randomBytes(32).toString("base64url");
  await prisma.$transaction([
    prisma.verificationToken.deleteMany({
      where: { identifier: `${identifierPrefix}${trimmedEmail}` },
    }),
    prisma.verificationToken.create({
      data: {
        identifier: `${identifierPrefix}${trimmedEmail}`,
        token: hashToken(token),
        expires: new Date(
          Date.now() + passwordSetupTokenMaxAgeDays * 24 * 60 * 60 * 1000,
        ),
      },
    }),
  ]);
  return token;
};

/** Email of a valid (not expired) password setup token, without consuming it. */
export const findPasswordSetupTokenEmail = async (token: string) => {
  const verificationToken = await prisma.verificationToken.findUnique({
    where: { token: hashToken(token) },
  });
  if (
    !verificationToken ||
    !verificationToken.identifier.startsWith(identifierPrefix) ||
    verificationToken.expires < new Date()
  )
    return;
  return verificationToken.identifier.slice(identifierPrefix.length);
};

export const deletePasswordSetupToken = (token: string) =>
  prisma.verificationToken.deleteMany({ where: { token: hashToken(token) } });
