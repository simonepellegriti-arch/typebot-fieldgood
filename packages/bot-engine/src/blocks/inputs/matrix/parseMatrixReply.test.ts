import { describe, expect, it } from "bun:test";
import { InputBlockType } from "@typebot.io/blocks-inputs/constants";
import type { MatrixInputBlock } from "@typebot.io/blocks-inputs/matrix/schema";
import { SessionStore } from "@typebot.io/runtime-session-store";
import { formatMatrixInputForDisplay } from "./formatMatrixInputForDisplay";
import { parseMatrixReply } from "./parseMatrixReply";

const block: MatrixInputBlock = {
  id: "matrix",
  type: InputBlockType.MATRIX,
  options: {
    question: "Quanto sei soddisfatto dei seguenti aspetti?",
    rows: [
      { id: "r1", label: "Qualità del prodotto", value: "1" },
      { id: "r2", label: "Prezzo", value: "2", variableId: "v_price" },
      { id: "r3", label: "Design", value: "3" },
    ],
    columns: [
      { id: "c1", label: "Per niente", value: "1" },
      { id: "c2", label: "Poco", value: "2" },
      { id: "c3", label: "Abbastanza", value: "3" },
      { id: "c4", label: "Molto", value: "4" },
    ],
  },
};

const variables = [{ id: "v_price", name: "D10_PRICE" }];

describe("parseMatrixReply", () => {
  it("stores one code per row (single choice per row)", () => {
    const reply = parseMatrixReply(
      {
        text: "",
        structuredReply: {
          type: "matrix",
          answers: { r1: ["c4"], r2: ["c3"], r3: ["c2"] },
        },
      },
      { block, variables },
    );
    expect(reply).toEqual({
      status: "success",
      content: "Qualità del prodotto: Molto\nPrezzo: Abbastanza\nDesign: Poco",
      variablesToUpdate: [{ id: "v_price", name: "D10_PRICE", value: "3" }],
      structuredAnswer: {
        value: { "1": 4, "2": 3, "3": 2 },
        label: { "1": "Molto", "2": "Abbastanza", "3": "Poco" },
        variableValue: '{"1":4,"2":3,"3":2}',
      },
    });
  });

  it("fails when a required row is missing", () => {
    expect(
      parseMatrixReply(
        {
          text: "",
          structuredReply: { type: "matrix", answers: { r1: ["c4"] } },
        },
        { block, variables },
      ),
    ).toEqual({ status: "fail" });
  });

  it("stores arrays in multiple mode", () => {
    const reply = parseMatrixReply(
      {
        text: "",
        structuredReply: {
          type: "matrix",
          answers: { r1: ["c1", "c4"] },
        },
      },
      {
        block: {
          ...block,
          options: {
            ...block.options,
            answerMode: "multiple",
            requiredMode: "none",
          },
        },
        variables,
      },
    );
    expect(reply).toMatchObject({
      status: "success",
      structuredAnswer: { value: { "1": [1, 4] } },
    });
  });

  it("parses text replies from API / WhatsApp by code or label", () => {
    expect(
      parseMatrixReply(
        { text: "1=4, 2=Abbastanza\n3=2", structuredReply: undefined },
        { block, variables },
      ),
    ).toMatchObject({
      status: "success",
      structuredAnswer: { value: { "1": 4, "2": 3, "3": 2 } },
    });
    expect(
      parseMatrixReply(
        {
          text: JSON.stringify({
            "Qualità del prodotto": "4",
            2: 3,
            3: "Poco",
          }),
          structuredReply: undefined,
        },
        { block, variables },
      ),
    ).toMatchObject({
      status: "success",
      structuredAnswer: { value: { "1": 4, "2": 3, "3": 2 } },
    });
    expect(
      parseMatrixReply(
        { text: "not a matrix answer", structuredReply: undefined },
        { block, variables },
      ),
    ).toEqual({ status: "fail" });
  });
});

describe("matrix randomization", () => {
  it("only changes the display order, never ids or codes", () => {
    const randomizedBlock: MatrixInputBlock = {
      ...block,
      options: {
        ...block.options,
        areRowsRandomized: true,
        areColumnsRandomized: true,
      },
    };
    // Deterministic "random" that reverses the order.
    const displayed = formatMatrixInputForDisplay(randomizedBlock, {
      variables: [],
      sessionStore: new SessionStore(),
      random: () => 0,
    });
    const displayedRows = displayed.options?.rows ?? [];
    expect(displayedRows.map((row) => row.id)).not.toEqual(["r1", "r2", "r3"]);
    expect([...displayedRows].sort((a, b) => a.id.localeCompare(b.id))).toEqual(
      block.options?.rows ?? [],
    );
    expect(
      [...(displayed.options?.columns ?? [])].sort((a, b) =>
        a.id.localeCompare(b.id),
      ),
    ).toEqual(block.options?.columns ?? []);

    // Answers given on the shuffled display are coded with the builder codes.
    const reply = parseMatrixReply(
      {
        text: "",
        structuredReply: {
          type: "matrix",
          answers: { r3: ["c2"], r1: ["c4"], r2: ["c3"] },
        },
      },
      { block: randomizedBlock, variables },
    );
    expect(reply).toMatchObject({
      structuredAnswer: { value: { "1": 4, "2": 3, "3": 2 } },
    });
  });

  it("keeps the builder order when randomization is off", () => {
    const displayed = formatMatrixInputForDisplay(block, {
      variables: [],
      sessionStore: new SessionStore(),
      random: () => 0,
    });
    expect(displayed.options?.rows?.map((row) => row.id)).toEqual([
      "r1",
      "r2",
      "r3",
    ]);
  });
});
