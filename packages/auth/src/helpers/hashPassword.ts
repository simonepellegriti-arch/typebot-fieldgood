import { randomBytes, scrypt } from "node:crypto";

export const passwordHashParameters = {
  N: 16384,
  r: 8,
  p: 1,
  keyLength: 64,
} as const;

/** scrypt hash stored as "scrypt:N:r:p:salt:hash" (base64), never the password. */
export const hashPassword = async (password: string) => {
  const salt = randomBytes(16);
  const { N, r, p, keyLength } = passwordHashParameters;
  const hash = await deriveKey(password, salt, { N, r, p, keyLength });
  return [
    "scrypt",
    N,
    r,
    p,
    salt.toString("base64"),
    hash.toString("base64"),
  ].join(":");
};

export const deriveKey = (
  password: string,
  salt: Buffer,
  {
    N,
    r,
    p,
    keyLength,
  }: { N: number; r: number; p: number; keyLength: number },
) =>
  new Promise<Buffer>((resolve, reject) =>
    scrypt(
      password.normalize("NFKC"),
      salt,
      keyLength,
      { N, r, p, maxmem: 64 * 1024 * 1024 },
      (error, key) => (error ? reject(error) : resolve(key)),
    ),
  );
