import { describe, expect, it } from "bun:test";
import { InputBlockType } from "@typebot.io/blocks-inputs/constants";
import type { InputBlock } from "@typebot.io/blocks-inputs/schema";
import { parseMultipleChoiceReply } from "../blocks/inputs/buttons/parseMultipleChoiceReply";
import { parseSingleChoiceReply } from "../blocks/inputs/buttons/parseSingleChoiceReply";
import { buildAnswerResearchFields } from "./buildAnswerResearchFields";

const satisfactionItems = [
  { id: "i1", content: "Molto soddisfatto", value: "5" },
  { id: "i2", content: "Per niente soddisfatto", value: "1" },
];

const colorItems = [
  { id: "c1", content: "Rosso, scuro", value: "1" },
  { id: "c2", content: "Blu", value: "2" },
  { id: "c3", content: "Verde", value: "3" },
];

const block = (type: InputBlockType) =>
  ({ id: "block", type, options: {} }) as unknown as InputBlock;

describe("single choice with label/value", () => {
  it("stores the code and keeps the displayed label", () => {
    const reply = parseSingleChoiceReply("Molto soddisfatto", {
      items: satisfactionItems,
      replyId: undefined,
    });
    expect(reply).toMatchObject({
      status: "success",
      content: "5",
      structuredAnswer: { value: "5", label: "Molto soddisfatto" },
    });
    if (reply.status !== "success") throw new Error("Expected success");
    expect(
      buildAnswerResearchFields({
        block: block(InputBlockType.CHOICE),
        content: reply.content,
        structuredAnswer: reply.structuredAnswer,
        variable: { dataType: "number" },
      }),
    ).toEqual({ value: 5, valueLabel: "Molto soddisfatto" });
  });
});

describe("multiple choice as array", () => {
  it("returns an array even when a label contains a comma", () => {
    const reply = parseMultipleChoiceReply("Rosso, scuro, Verde", {
      items: colorItems,
    });
    expect(reply).toMatchObject({
      status: "success",
      structuredAnswer: {
        value: ["1", "3"],
        label: ["Rosso, scuro", "Verde"],
      },
    });
    if (reply.status !== "success") throw new Error("Expected success");
    expect(
      buildAnswerResearchFields({
        block: block(InputBlockType.CHOICE),
        content: reply.content,
        structuredAnswer: reply.structuredAnswer,
        variable: { dataType: "number[]" },
      }).value,
    ).toEqual([1, 3]);
    expect(
      buildAnswerResearchFields({
        block: block(InputBlockType.CHOICE),
        content: reply.content,
        structuredAnswer: reply.structuredAnswer,
        variable: undefined,
      }).value,
    ).toEqual(["1", "3"]);
  });
});

describe("typed values", () => {
  it("stores -5 as a number", () => {
    expect(
      buildAnswerResearchFields({
        block: block(InputBlockType.NUMBER),
        content: "-5",
        structuredAnswer: undefined,
        variable: undefined,
      }).value,
    ).toBe(-5);
  });

  it("keeps +39 phone numbers as text", () => {
    expect(
      buildAnswerResearchFields({
        block: block(InputBlockType.PHONE),
        content: "+393401234567",
        structuredAnswer: undefined,
        variable: { dataType: "string" },
      }).value,
    ).toBe("+393401234567");
  });
});
