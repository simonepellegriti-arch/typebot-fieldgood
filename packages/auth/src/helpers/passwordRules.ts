export const minPasswordLength = 8;
export const maxPasswordLength = 128;

/** Reason a new password is refused, if any (checked in the browser and on the server). */
export const getPasswordProblem = (
  password: string,
): "tooShort" | "tooLong" | "tooSimple" | undefined => {
  if (password.length < minPasswordLength) return "tooShort";
  if (password.length > maxPasswordLength) return "tooLong";
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) return "tooSimple";
  return undefined;
};
