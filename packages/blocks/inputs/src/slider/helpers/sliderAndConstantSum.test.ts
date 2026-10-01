import { describe, expect, it } from "bun:test";
import { validateConstantSumValues } from "../../constantSum/helpers/validateConstantSumValues";
import { getSliderRows } from "./getSliderRows";
import { resolveSliderScale } from "./resolveSliderScale";
import { validateSliderValues } from "./validateSliderValues";

describe("slider scale", () => {
  it("defaults to -100..+100 starting at 0", () => {
    expect(resolveSliderScale(undefined)).toEqual({
      min: -100,
      max: 100,
      step: 1,
      startValue: 0,
    });
  });

  it("keeps the start value inside the scale", () => {
    expect(
      resolveSliderScale({ min: 0, max: 10, startValue: 50 }).startValue,
    ).toBe(10);
  });

  it("uses the question as the only slider when there is no statement", () => {
    expect(getSliderRows({}).map((row) => row.id)).toEqual(["slider"]);
  });
});

describe("validateSliderValues", () => {
  const options = { rows: [{ id: "a" }, { id: "b" }] };

  it("accepts a value for every statement inside the scale", () => {
    expect(
      validateSliderValues({ values: { a: -100, b: 37 }, options }),
    ).toEqual({ status: "valid" });
  });

  it("refuses missing, out of scale and off-step values", () => {
    expect(validateSliderValues({ values: { a: 10 }, options }).status).toBe(
      "invalid",
    );
    expect(
      validateSliderValues({ values: { a: 101, b: 0 }, options }).status,
    ).toBe("invalid");
    expect(
      validateSliderValues({
        values: { a: 15, b: 0 },
        options: { ...options, step: 10 },
      }).status,
    ).toBe("invalid");
    expect(
      validateSliderValues({ values: { a: 1, b: 1, c: 1 }, options }).status,
    ).toBe("invalid");
  });
});

describe("validateConstantSumValues", () => {
  const options = {
    items: [{ id: "a" }, { id: "b" }, { id: "c" }],
  };

  it("accepts whole numbers adding up exactly to 100 (empty = 0)", () => {
    expect(
      validateConstantSumValues({ values: { a: 60, c: 40 }, options }),
    ).toEqual({ status: "valid", sum: 100 });
  });

  it("refuses another total, negative or decimal amounts", () => {
    expect(
      validateConstantSumValues({ values: { a: 60, b: 30 }, options }),
    ).toMatchObject({ status: "invalid", reason: "wrongTotal", sum: 90 });
    expect(
      validateConstantSumValues({ values: { a: 120, b: -20 }, options }),
    ).toMatchObject({ status: "invalid", reason: "negative" });
    expect(
      validateConstantSumValues({ values: { a: 50.5, b: 49.5 }, options }),
    ).toMatchObject({ status: "invalid", reason: "notAWholeNumber" });
  });

  it("uses the configured total", () => {
    expect(
      validateConstantSumValues({
        values: { a: 7, b: 3 },
        options: { ...options, total: 10 },
      }).status,
    ).toBe("valid");
  });
});
