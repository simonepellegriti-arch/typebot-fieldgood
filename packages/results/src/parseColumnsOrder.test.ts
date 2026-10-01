import { describe, expect, it } from "bun:test";
import { parseColumnsOrder } from "./parseColumnsOrder";
import type { ResultHeaderCell } from "./schemas/results";

const resultHeader = [
  {
    id: "createdAt",
    label: "Created at",
  },
  {
    id: "email",
    label: "Email",
  },
  {
    id: "name",
    label: "Name",
  },
] satisfies ResultHeaderCell[];

describe("parseColumnsOrder", () => {
  it("returns the default order when no order is saved", () => {
    expect(parseColumnsOrder(undefined, resultHeader)).toEqual([
      "select",
      "createdAt",
      "email",
      "name",
      "logs",
    ]);
  });

  it("keeps the saved order and appends missing result headers", () => {
    expect(parseColumnsOrder(["email", "createdAt"], resultHeader)).toEqual([
      "select",
      "email",
      "createdAt",
      "name",
      "logs",
    ]);
  });

  it("resets orders saved with the old control column format", () => {
    expect(
      parseColumnsOrder(["select", "email", "logs"], resultHeader),
    ).toEqual(["select", "createdAt", "email", "name", "logs"]);
  });
});

describe("parseColumnsOrder with loop columns", () => {
  it("puts new loop columns next to their question column", () => {
    const header = [
      { id: "date", label: "Submitted at" },
      { id: "b_d2", label: "D2" },
      { id: "b_d2__loop_l%3A1", label: "D2 · #1" },
      { id: "b_d2__loop_l%3A2", label: "D2 · #2" },
      { id: "b_d6", label: "D6" },
    ] satisfies ResultHeaderCell[];
    expect(parseColumnsOrder(["date", "b_d2", "b_d6"], header)).toEqual([
      "select",
      "date",
      "b_d2",
      "b_d2__loop_l%3A1",
      "b_d2__loop_l%3A2",
      "b_d6",
      "logs",
    ]);
  });
});
