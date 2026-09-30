import { describe, expect, it } from "bun:test";
import { applyScoreOperation } from "./applyScoreOperation";
import { sumDefinedScores } from "./sumDefinedScores";

describe("applyScoreOperation", () => {
  it("adds, subtracts, sets and multiplies", () => {
    expect(
      applyScoreOperation({ currentValue: "10", score: 5, operation: "add" }),
    ).toBe(15);
    expect(
      applyScoreOperation({
        currentValue: "10",
        score: -5,
        operation: undefined,
      }),
    ).toBe(5);
    expect(
      applyScoreOperation({
        currentValue: 10,
        score: 3,
        operation: "subtract",
      }),
    ).toBe(7);
    expect(
      applyScoreOperation({ currentValue: "10", score: 2, operation: "set" }),
    ).toBe(2);
    expect(
      applyScoreOperation({
        currentValue: "2,5",
        score: 2,
        operation: "multiply",
      }),
    ).toBe(5);
  });

  it("starts empty or non numeric variables from 0 and avoids float artefacts", () => {
    expect(
      applyScoreOperation({
        currentValue: undefined,
        score: 4,
        operation: "add",
      }),
    ).toBe(4);
    expect(
      applyScoreOperation({ currentValue: "abc", score: -1, operation: "add" }),
    ).toBe(-1);
    expect(
      applyScoreOperation({
        currentValue: "0.1",
        score: 0.2,
        operation: "add",
      }),
    ).toBe(0.3);
  });
});

describe("sumDefinedScores", () => {
  it("sums only defined scores and returns null when there is none", () => {
    expect(sumDefinedScores([1, undefined, -3])).toBe(-2);
    expect(sumDefinedScores([0])).toBe(0);
    expect(sumDefinedScores([undefined, undefined])).toBeNull();
    expect(sumDefinedScores([])).toBeNull();
  });
});
