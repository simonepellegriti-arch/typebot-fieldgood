/** Letters and digits that can't be confused when typed (no 0/O, 1/l/I). */
const alphabet = "23456789abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";

/** Unguessable token of a personal link (10 characters, ~57 bits). */
export const generateParticipantToken = () =>
  Array.from(
    crypto.getRandomValues(new Uint8Array(10)),
    (byte) => alphabet[byte % alphabet.length],
  ).join("");
