import type { ScoreOperation } from "./schema";

/**
 * Applies an answer score to the current value of a score variable.
 * Non numeric current values count as 0 (a fresh score variable is empty).
 */
export const applyScoreOperation = ({
  currentValue,
  score,
  operation,
}: {
  currentValue: unknown;
  score: number;
  operation: ScoreOperation | undefined;
}): number => {
  const parsedCurrentValue = Number(
    typeof currentValue === "string"
      ? currentValue.replace(",", ".")
      : currentValue,
  );
  const current = Number.isFinite(parsedCurrentValue) ? parsedCurrentValue : 0;
  switch (operation ?? "add") {
    case "add":
      return roundScore(current + score);
    case "subtract":
      return roundScore(current - score);
    case "set":
      return roundScore(score);
    case "multiply":
      return roundScore(current * score);
  }
};

/** Avoids 0.1 + 0.2 artefacts in stored scores. */
const roundScore = (score: number) => Math.round(score * 1e6) / 1e6;
