import { beforeEach, describe, expect, it, mock } from "bun:test";

type VerificationToken = {
  identifier: string;
  token: string;
  expires: Date;
  failedAttempts: number;
};
type StoredUser = { id: string; email: string; name: string | null };

const verificationTokens: VerificationToken[] = [];
const users: StoredUser[] = [];
const passwords = new Map<string, string>();
const sessions: { sessionToken: string; userId: string }[] = [];
const createdUsers: string[] = [];

const matches = (value: string | null, filter: { equals: string }) =>
  value?.toLowerCase() === filter.equals.toLowerCase();

const withPassword = (user: StoredUser | undefined) =>
  user
    ? {
        id: user.id,
        password: passwords.has(user.id)
          ? { hash: passwords.get(user.id) ?? "" }
          : null,
      }
    : null;

process.env.SKIP_ENV_CHECK = "true";
process.env.ENCRYPTION_SECRET = "12345678901234567890123456789012";
process.env.NEXTAUTH_URL = "https://fieldbot.example.com";

mock.module("@typebot.io/prisma", () => ({
  default: {
    $transaction: (operations: Promise<unknown>[]) => Promise.all(operations),
    verificationToken: {
      findFirst: async ({ where }: { where: { identifier: string } }) =>
        verificationTokens.find((t) => t.identifier === where.identifier) ??
        null,
      findUnique: async ({ where }: { where: { token: string } }) =>
        verificationTokens.find((t) => t.token === where.token) ?? null,
      create: async ({ data }: { data: Partial<VerificationToken> }) => {
        const token = {
          identifier: data.identifier ?? "",
          token: data.token ?? "",
          expires: data.expires ?? new Date(),
          failedAttempts: data.failedAttempts ?? 0,
        };
        verificationTokens.push(token);
        return token;
      },
      update: async ({ where }: { where: { token: string } }) => {
        const token = verificationTokens.find((t) => t.token === where.token);
        if (token) token.failedAttempts += 1;
        return token;
      },
      deleteMany: async ({
        where,
      }: {
        where: { identifier?: string; token?: string };
      }) => {
        for (let index = verificationTokens.length - 1; index >= 0; index--) {
          const token = verificationTokens[index];
          if (
            token &&
            (token.identifier === where.identifier ||
              token.token === where.token)
          )
            verificationTokens.splice(index, 1);
        }
        return { count: 0 };
      },
    },
    user: {
      findFirst: async ({ where }: { where: { email: { equals: string } } }) =>
        withPassword(users.find((u) => matches(u.email, where.email))),
      findMany: async ({ where }: { where: { name: { equals: string } } }) =>
        users
          .filter((u) => matches(u.name, where.name))
          .map((u) => withPassword(u)),
      update: async () => ({}),
    },
    session: {
      create: async ({
        data,
      }: {
        data: { sessionToken: string; userId: string };
      }) => {
        sessions.push(data);
        return data;
      },
      deleteMany: async ({ where }: { where: { userId: string } }) => {
        for (let index = sessions.length - 1; index >= 0; index--)
          if (sessions[index]?.userId === where.userId)
            sessions.splice(index, 1);
        return { count: 0 };
      },
    },
    userPassword: {
      upsert: async ({
        create,
      }: {
        create: { userId: string; hash: string };
      }) => {
        passwords.set(create.userId, create.hash);
        return create;
      },
    },
  },
}));

mock.module("@typebot.io/auth/helpers/createAuthPrismaAdapter", () => ({
  createAuthPrismaAdapter: () => ({
    createUser: async ({ email }: { email: string }) => {
      const user = { id: `user-${users.length + 1}`, email, name: null };
      users.push(user);
      createdUsers.push(email);
      return user;
    },
  }),
}));

const { createPasswordSetupToken } = await import(
  "@typebot.io/auth/helpers/passwordSetupTokens"
);
const { handleGetPasswordSetupLink } = await import(
  "./handleGetPasswordSetupLink"
);
const { handlePasswordSetup } = await import("./handlePasswordSetup");
const { handlePasswordSignIn } = await import("./handlePasswordSignIn");

const postJson = (
  path: string,
  body: unknown,
  origin = process.env.NEXTAUTH_URL,
) =>
  new Request(`${process.env.NEXTAUTH_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: origin ?? "" },
    body: JSON.stringify(body),
  });

const signIn = (identifier: string, password: string) =>
  handlePasswordSignIn(
    postJson("/api/auth/password/signin", { identifier, password }),
  );

describe("password setup and sign-in", () => {
  beforeEach(() => {
    verificationTokens.splice(0);
    users.splice(0);
    passwords.clear();
    sessions.splice(0);
    createdUsers.splice(0);
  });

  it("creates the invited user with their password, then signs them in", async () => {
    const token = await createPasswordSetupToken("Mario.Rossi@fieldgood.it");
    expect(verificationTokens.some((stored) => stored.token === token)).toBe(
      false,
    );

    const linkResponse = await handleGetPasswordSetupLink(
      new Request(`https://x/api/auth/password/setup?token=${token}`),
    );
    expect(await linkResponse.json()).toEqual({
      email: "Mario.Rossi@fieldgood.it",
    });

    const setupResponse = await handlePasswordSetup(
      postJson("/api/auth/password/setup", { token, password: "Campo2026" }),
    );
    expect(setupResponse.status).toBe(200);
    expect(createdUsers).toEqual(["Mario.Rossi@fieldgood.it"]);

    const reusedResponse = await handlePasswordSetup(
      postJson("/api/auth/password/setup", { token, password: "Altro2026" }),
    );
    expect(reusedResponse.status).toBe(404);

    const signInResponse = await signIn(
      "mario.rossi@fieldgood.it",
      "Campo2026",
    );
    expect(signInResponse.status).toBe(200);
    const cookie = signInResponse.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("__Secure-authjs.session-token=");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(sessions).toHaveLength(1);
  });

  it("refuses wrong passwords, weak passwords and other origins", async () => {
    const token = await createPasswordSetupToken("anna@fieldgood.it");
    const weakResponse = await handlePasswordSetup(
      postJson("/api/auth/password/setup", { token, password: "password" }),
    );
    expect(await weakResponse.json()).toEqual({ error: "tooSimple" });
    await handlePasswordSetup(
      postJson("/api/auth/password/setup", { token, password: "Anna12345" }),
    );
    expect((await signIn("anna@fieldgood.it", "anna12345")).status).toBe(401);
    expect((await signIn("nobody@fieldgood.it", "Anna12345")).status).toBe(401);
    const crossOriginResponse = await handlePasswordSignIn(
      postJson(
        "/api/auth/password/signin",
        { identifier: "anna@fieldgood.it", password: "Anna12345" },
        "https://evil.example.com",
      ),
    );
    expect(crossOriginResponse.status).toBe(403);
    expect(sessions).toHaveLength(0);
  });

  it("locks the account for a while after 10 failed attempts", async () => {
    const token = await createPasswordSetupToken("luca@fieldgood.it");
    await handlePasswordSetup(
      postJson("/api/auth/password/setup", { token, password: "Luca12345" }),
    );
    for (let attempt = 0; attempt < 10; attempt++)
      await signIn("luca@fieldgood.it", `wrong${attempt}`);
    expect((await signIn("luca@fieldgood.it", "Luca12345")).status).toBe(429);
  });

  it("resets the password of an existing user and closes their sessions", async () => {
    users.push({ id: "user-1", email: "simone@fieldgood.it", name: "Simone" });
    sessions.push({ sessionToken: "old", userId: "user-1" });
    const token = await createPasswordSetupToken("simone@fieldgood.it");
    await handlePasswordSetup(
      postJson("/api/auth/password/setup", { token, password: "Nuova2026" }),
    );
    expect(createdUsers).toEqual([]);
    expect(sessions).toHaveLength(0);
    expect((await signIn("Simone", "Nuova2026")).status).toBe(200);
  });
});
