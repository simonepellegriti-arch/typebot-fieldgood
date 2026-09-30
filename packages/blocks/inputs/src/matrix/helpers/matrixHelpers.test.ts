import { describe, expect, it } from "bun:test";
import type { MatrixInputOptions } from "../schema";
import { getMatrixCode } from "./getMatrixCode";
import { resolveMatrixLayout } from "./resolveMatrixLayout";
import { toggleMatrixSelection } from "./toggleMatrixSelection";
import { validateMatrixAnswers } from "./validateMatrixAnswers";

const options = {
  rows: [
    { id: "r1", label: "Qualità del prodotto", value: "1" },
    { id: "r2", label: "Prezzo", value: "2", isRequired: true },
    { id: "r3", label: "Design", value: "3" },
  ],
  columns: [
    { id: "c1", label: "Per niente", value: "1" },
    { id: "c2", label: "Poco", value: "2" },
    { id: "c3", label: "Abbastanza", value: "3" },
    { id: "c4", label: "Molto", value: "4" },
  ],
} satisfies MatrixInputOptions;

describe("matrix selection", () => {
  it("keeps one column per row in single mode", () => {
    const answers = toggleMatrixSelection({
      answers: { r1: ["c1"] },
      rowId: "r1",
      columnId: "c4",
      answerMode: "single",
    });
    expect(answers).toEqual({ r1: ["c4"] });
  });

  it("toggles columns independently in multiple mode", () => {
    let answers = toggleMatrixSelection({
      answers: {},
      rowId: "r1",
      columnId: "c1",
      answerMode: "multiple",
    });
    answers = toggleMatrixSelection({
      answers,
      rowId: "r1",
      columnId: "c2",
      answerMode: "multiple",
    });
    expect(answers).toEqual({ r1: ["c1", "c2"] });
    answers = toggleMatrixSelection({
      answers,
      rowId: "r1",
      columnId: "c1",
      answerMode: "multiple",
    });
    expect(answers).toEqual({ r1: ["c2"] });
  });
});

describe("matrix validation", () => {
  it("requires all rows by default", () => {
    expect(
      validateMatrixAnswers({ answers: { r1: ["c1"] }, options }),
    ).toMatchObject({ status: "invalid", reason: "missingRequiredRow" });
    expect(
      validateMatrixAnswers({
        answers: { r1: ["c1"], r2: ["c2"], r3: ["c4"] },
        options,
      }),
    ).toEqual({ status: "valid" });
  });

  it("accepts an empty matrix when no row is required", () => {
    expect(
      validateMatrixAnswers({
        answers: {},
        options: { ...options, requiredMode: "none" },
      }),
    ).toEqual({ status: "valid" });
  });

  it("only requires selected rows in custom mode", () => {
    const customOptions = { ...options, requiredMode: "custom" as const };
    expect(
      validateMatrixAnswers({
        answers: { r1: ["c1"] },
        options: customOptions,
      }),
    ).toEqual({ status: "invalid", reason: "missingRequiredRow", rowId: "r2" });
    expect(
      validateMatrixAnswers({
        answers: { r2: ["c1"] },
        options: customOptions,
      }),
    ).toEqual({ status: "valid" });
  });

  it("checks min and max answered rows", () => {
    const rangeOptions = {
      ...options,
      requiredMode: "none" as const,
      minAnsweredRows: 2,
      maxAnsweredRows: 2,
    };
    expect(
      validateMatrixAnswers({ answers: { r1: ["c1"] }, options: rangeOptions }),
    ).toMatchObject({ reason: "belowMinAnsweredRows" });
    expect(
      validateMatrixAnswers({
        answers: { r1: ["c1"], r2: ["c1"], r3: ["c1"] },
        options: rangeOptions,
      }),
    ).toMatchObject({ reason: "aboveMaxAnsweredRows" });
  });

  it("rejects several columns in a row in single mode and unknown ids", () => {
    expect(
      validateMatrixAnswers({
        answers: { r1: ["c1", "c2"], r2: ["c1"], r3: ["c1"] },
        options,
      }),
    ).toMatchObject({ reason: "tooManyColumnsInRow" });
    expect(
      validateMatrixAnswers({ answers: { nope: ["c1"] }, options }),
    ).toMatchObject({ reason: "unknownRow" });
    expect(
      validateMatrixAnswers({
        answers: { r1: ["nope"], r2: ["c1"], r3: ["c1"] },
        options,
      }),
    ).toMatchObject({ reason: "unknownColumn" });
  });
});

describe("matrix codes and layout", () => {
  it("uses the configured code, or the builder position when missing", () => {
    expect(getMatrixCode({ value: "QUALITY" }, 0)).toBe("QUALITY");
    expect(getMatrixCode({ value: "  " }, 2)).toBe("3");
    expect(getMatrixCode({}, 0)).toBe("1");
  });

  it("shows one card per row on smartphones and a table on desktop", () => {
    expect(
      resolveMatrixLayout({
        layout: undefined,
        containerWidth: 360,
        columnCount: 5,
      }),
    ).toBe("cards");
    expect(
      resolveMatrixLayout({
        layout: "auto",
        containerWidth: 800,
        columnCount: 5,
      }),
    ).toBe("table");
    // Too many columns for the available width: cards even on a tablet.
    expect(
      resolveMatrixLayout({
        layout: "auto",
        containerWidth: 600,
        columnCount: 11,
      }),
    ).toBe("cards");
    expect(
      resolveMatrixLayout({
        layout: "table",
        containerWidth: 320,
        columnCount: 5,
      }),
    ).toBe("table");
  });
});
