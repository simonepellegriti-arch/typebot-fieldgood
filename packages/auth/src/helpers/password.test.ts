import { describe, expect, it } from "bun:test";
import { hashPassword } from "./hashPassword";
import { getPasswordProblem } from "./passwordRules";
import { verifyPassword } from "./verifyPassword";

describe("password hashing", () => {
  it("verifies the right password only", async () => {
    const storedHash = await hashPassword("Fieldbot2026");
    expect(storedHash.startsWith("scrypt:16384:8:1:")).toBe(true);
    expect(storedHash).not.toContain("Fieldbot2026");
    expect(await verifyPassword("Fieldbot2026", storedHash)).toBe(true);
    expect(await verifyPassword("fieldbot2026", storedHash)).toBe(false);
    expect(await verifyPassword("Fieldbot2026", "garbage")).toBe(false);
  });

  it("salts every hash", async () => {
    expect(await hashPassword("same-password1")).not.toBe(
      await hashPassword("same-password1"),
    );
  });
});

describe("getPasswordProblem", () => {
  it("requires 8 characters with letters and numbers", () => {
    expect(getPasswordProblem("abc1")).toBe("tooShort");
    expect(getPasswordProblem("abcdefgh")).toBe("tooSimple");
    expect(getPasswordProblem("12345678")).toBe("tooSimple");
    expect(getPasswordProblem("abcdefg1")).toBeUndefined();
  });
});
