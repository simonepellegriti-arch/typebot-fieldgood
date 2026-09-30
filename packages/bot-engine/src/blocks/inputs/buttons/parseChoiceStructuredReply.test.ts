import { describe, expect, it } from "bun:test";
import type { ChoiceInputBlock } from "@typebot.io/blocks-inputs/choice/schema";
import { InputBlockType } from "@typebot.io/blocks-inputs/constants";
import { SessionStore } from "@typebot.io/runtime-session-store";
import { validateAndParseInputMessage } from "../../../validateAndParseInputMessage";
import { parseChoiceStructuredReply } from "./parseChoiceStructuredReply";

const brandItems: ChoiceInputBlock["items"] = [
  { id: "apple", content: "Apple", value: "1", outgoingEdgeId: "edge-apple" },
  { id: "samsung", content: "Samsung", value: "2" },
  {
    id: "other",
    content: "Altro, specificare",
    value: "98",
    hasTextInput: true,
    textInputRequired: true,
    outgoingEdgeId: "edge-other",
  },
  { id: "none", content: "Nessuno di questi", value: "99", isExclusive: true },
];

describe("other, please specify (single choice)", () => {
  it("saves the code and the open text separately", () => {
    expect(
      parseChoiceStructuredReply(
        {
          type: "choice",
          itemIds: ["other"],
          otherTexts: { other: " Marca XYZ " },
        },
        { items: brandItems, options: {} },
      ),
    ).toEqual({
      status: "success",
      content: "98",
      outgoingEdgeId: "edge-other",
      structuredAnswer: {
        value: "98",
        label: "Altro, specificare",
        otherTexts: { "98": "Marca XYZ" },
      },
    });
  });

  it("fails when the required text is empty", () => {
    expect(
      parseChoiceStructuredReply(
        { type: "choice", itemIds: ["other"], otherTexts: { other: "  " } },
        { items: brandItems, options: {} },
      ),
    ).toEqual({ status: "fail" });
  });

  it("ignores texts of options that are not selected", () => {
    const reply = parseChoiceStructuredReply(
      { type: "choice", itemIds: ["apple"], otherTexts: { other: "XYZ" } },
      { items: brandItems, options: {} },
    );
    expect(reply).toMatchObject({
      status: "success",
      content: "1",
      structuredAnswer: { value: "1", otherTexts: undefined },
    });
  });
});

describe("other, please specify (multiple choice)", () => {
  it("keeps codes as an array and texts by code", () => {
    expect(
      parseChoiceStructuredReply(
        {
          type: "choice",
          itemIds: ["other", "apple"],
          otherTexts: { other: "Marca XYZ" },
        },
        { items: brandItems, options: { isMultipleChoice: true } },
      ),
    ).toEqual({
      status: "success",
      content: "1, 98",
      structuredAnswer: {
        value: ["1", "98"],
        label: ["Apple", "Altro, specificare"],
        otherTexts: { "98": "Marca XYZ" },
      },
    });
  });

  it("rejects an exclusive answer combined with another one", () => {
    expect(
      parseChoiceStructuredReply(
        { type: "choice", itemIds: ["none", "apple"] },
        { items: brandItems, options: { isMultipleChoice: true } },
      ),
    ).toEqual({ status: "fail" });
  });

  it("accepts an exclusive answer below minSelections", () => {
    expect(
      parseChoiceStructuredReply(
        { type: "choice", itemIds: ["none"] },
        {
          items: brandItems,
          options: { isMultipleChoice: true, minSelections: 2 },
        },
      ),
    ).toMatchObject({ status: "success", structuredAnswer: { value: ["99"] } });
  });
});

describe("plain text multiple choice replies (API, WhatsApp)", () => {
  const block: ChoiceInputBlock = {
    id: "block",
    type: InputBlockType.CHOICE,
    items: brandItems,
    options: { isMultipleChoice: true, minSelections: 2, maxSelections: 2 },
  };
  const parse = (text: string) =>
    validateAndParseInputMessage(
      { type: "text", text },
      { block, variables: [], sessionStore: new SessionStore() },
    );

  it("applies min/max selections", () => {
    expect(parse("Apple")).toEqual({ status: "fail" });
    expect(parse("Apple, Samsung")).toMatchObject({ status: "success" });
  });

  it("accepts an exclusive answer alone and rejects it with others", () => {
    expect(parse("Nessuno di questi")).toMatchObject({ status: "success" });
    expect(parse("Apple, Nessuno di questi")).toEqual({ status: "fail" });
  });

  it("keeps legacy blocks unchanged", () => {
    const legacyBlock: ChoiceInputBlock = {
      id: "legacy",
      type: InputBlockType.CHOICE,
      items: [
        { id: "a", content: "A" },
        { id: "b", content: "B" },
      ],
      options: { isMultipleChoice: true },
    };
    expect(
      validateAndParseInputMessage(
        { type: "text", text: "A" },
        { block: legacyBlock, variables: [], sessionStore: new SessionStore() },
      ),
    ).toMatchObject({ status: "success", content: "A" });
  });
});
