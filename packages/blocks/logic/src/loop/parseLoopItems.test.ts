import { describe, expect, it } from "bun:test";
import { maxLoopIterations } from "./constants";
import { parseLoopItems } from "./parseLoopItems";

describe("parseLoopItems", () => {
  it("reads lists from arrays, JSON arrays and separated texts", () => {
    expect(
      parseLoopItems({ sourceType: "list" }, ["Nike", " Puma ", null]),
    ).toEqual(["Nike", "Puma"]);
    expect(parseLoopItems({ sourceType: "list" }, '["1","3"]')).toEqual([
      "1",
      "3",
    ]);
    expect(parseLoopItems({ sourceType: "list" }, "Nike\nAdidas")).toEqual([
      "Nike",
      "Adidas",
    ]);
    expect(parseLoopItems({ sourceType: "list" }, "Nike | Adidas")).toEqual([
      "Nike",
      "Adidas",
    ]);
    expect(parseLoopItems({ sourceType: "answers" }, "1, 3")).toEqual([
      "1",
      "3",
    ]);
    expect(parseLoopItems({ sourceType: "list" }, undefined)).toEqual([]);
  });

  it("repeats a fixed or variable number of times", () => {
    expect(
      parseLoopItems({ sourceType: "count", count: 3 }, undefined),
    ).toEqual(["1", "2", "3"]);
    expect(
      parseLoopItems(
        { sourceType: "count", count: 3, sourceVariableId: "v" },
        "2",
      ),
    ).toEqual(["1", "2"]);
    // Empty count variable: the fixed count is used.
    expect(
      parseLoopItems(
        { sourceType: "count", count: 2, sourceVariableId: "v" },
        "",
      ),
    ).toEqual(["1", "2"]);
    expect(
      parseLoopItems({ sourceType: "count", sourceVariableId: "v" }, "999999"),
    ).toHaveLength(maxLoopIterations);
  });
});
