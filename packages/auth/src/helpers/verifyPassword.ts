import { timingSafeEqual } from "node:crypto";
import { deriveKey } from "./hashPassword";

export const verifyPassword = async (password: string, storedHash: string) => {
  const [algorithm, N, r, p, salt, hash] = storedHash.split(":");
  if (algorithm !== "scrypt" || !N || !r || !p || !salt || !hash) return false;
  const expectedHash = Buffer.from(hash, "base64");
  const actualHash = await deriveKey(password, Buffer.from(salt, "base64"), {
    N: Number(N),
    r: Number(r),
    p: Number(p),
    keyLength: expectedHash.length,
  });
  return (
    actualHash.length === expectedHash.length &&
    timingSafeEqual(actualHash, expectedHash)
  );
};
