import type { AnswerResearchValue } from "../schemas/answers";

export type ObjectResearchValue = Exclude<
  AnswerResearchValue,
  string | number | boolean | string[] | number[]
>;

/** Matrix (row -> column codes) and video watch results are stored as objects. */
export const isObjectResearchValue = (
  value: AnswerResearchValue | null | undefined,
): value is ObjectResearchValue =>
  typeof value === "object" && value !== null && !Array.isArray(value);
