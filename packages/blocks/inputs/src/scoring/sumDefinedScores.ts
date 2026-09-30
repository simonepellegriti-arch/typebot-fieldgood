/**
 * Sums the scores of the selected options. Returns null when none of them has a
 * score: "no score" is different from a score of 0.
 */
export const sumDefinedScores = (
  scores: (number | undefined | null)[],
): number | null => {
  const definedScores = scores.filter(
    (score): score is number =>
      typeof score === "number" && Number.isFinite(score),
  );
  if (definedScores.length === 0) return null;
  return (
    Math.round(definedScores.reduce((sum, score) => sum + score, 0) * 1e6) / 1e6
  );
};
