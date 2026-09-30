import { describe, expect, it } from "bun:test";
import { pickOtherTexts } from "./pickOtherTexts";
import { toggleChoiceSelection } from "./toggleChoiceSelection";
import { validateChoiceSelection } from "./validateChoiceSelection";

const items = [
  { id: "coca", content: "Coca-Cola", value: "1" },
  { id: "pepsi", content: "Pepsi", value: "2" },
  { id: "fanta", content: "Fanta", value: "3" },
  {
    id: "other",
    content: "Altro, specificare",
    value: "98",
    hasTextInput: true,
    textInputRequired: true,
  },
  { id: "none", content: "Nessuno di questi", value: "99", isExclusive: true },
  { id: "dk", content: "Non so", value: "97", isExclusive: true },
];

const toggle = (selectedItemIds: string[], itemId: string, max?: number) =>
  toggleChoiceSelection({ selectedItemIds, itemId, items, maxSelections: max });

describe("exclusive options", () => {
  it("selects regular answers normally", () => {
    expect(toggle(toggle([], "coca"), "pepsi")).toEqual(["coca", "pepsi"]);
  });

  it("deselects a regular answer when clicked again", () => {
    expect(toggle(["coca", "pepsi"], "coca")).toEqual(["pepsi"]);
  });

  it("selecting an exclusive answer deselects all the others", () => {
    expect(toggle(["coca", "pepsi"], "none")).toEqual(["none"]);
  });

  it("selecting a regular answer deselects the exclusive one", () => {
    expect(toggle(["none"], "fanta")).toEqual(["fanta"]);
  });

  it("two exclusive answers are never selected together", () => {
    expect(toggle(["none"], "dk")).toEqual(["dk"]);
    expect(
      validateChoiceSelection({
        selectedItemIds: ["none", "dk"],
        items,
        isMultipleChoice: true,
      }),
    ).toEqual({ status: "invalid", reason: "exclusiveConflict" });
  });

  it("options without isExclusive behave like before", () => {
    const legacyItems = [{ id: "a" }, { id: "b" }];
    expect(
      toggleChoiceSelection({
        selectedItemIds: ["a"],
        itemId: "b",
        items: legacyItems,
      }),
    ).toEqual(["a", "b"]);
  });
});

describe("min / max selections", () => {
  it("an exclusive answer is valid even when minSelections is 2", () => {
    expect(
      validateChoiceSelection({
        selectedItemIds: ["none"],
        items,
        isMultipleChoice: true,
        minSelections: 2,
      }),
    ).toEqual({ status: "valid" });
  });

  it("a single regular answer is invalid when minSelections is 2", () => {
    expect(
      validateChoiceSelection({
        selectedItemIds: ["coca"],
        items,
        isMultipleChoice: true,
        minSelections: 2,
      }),
    ).toEqual({ status: "invalid", reason: "belowMinSelections" });
  });

  it("doesn't add answers beyond maxSelections but still allows an exclusive one", () => {
    expect(toggle(["coca", "pepsi"], "fanta", 2)).toEqual(["coca", "pepsi"]);
    expect(toggle(["coca", "pepsi"], "none", 2)).toEqual(["none"]);
    expect(
      validateChoiceSelection({
        selectedItemIds: ["coca", "pepsi", "fanta"],
        items,
        isMultipleChoice: true,
        maxSelections: 2,
      }),
    ).toEqual({ status: "invalid", reason: "aboveMaxSelections" });
  });
});

describe("other, please specify", () => {
  it("requires the text when textInputRequired is set", () => {
    expect(
      validateChoiceSelection({
        selectedItemIds: ["other"],
        items,
        isMultipleChoice: false,
        otherTexts: { other: "   " },
      }),
    ).toEqual({
      status: "invalid",
      reason: "missingOtherText",
      itemId: "other",
    });
    expect(
      validateChoiceSelection({
        selectedItemIds: ["other"],
        items,
        isMultipleChoice: false,
        otherTexts: { other: "Marca XYZ" },
      }),
    ).toEqual({ status: "valid" });
  });

  it("drops texts of deselected options and trims the others", () => {
    expect(
      pickOtherTexts({
        selectedItemIds: ["coca"],
        items,
        otherTexts: { other: "Marca XYZ" },
      }),
    ).toEqual({});
    expect(
      pickOtherTexts({
        selectedItemIds: ["coca", "other"],
        items,
        otherTexts: { other: "  Marca XYZ " },
      }),
    ).toEqual({ other: "Marca XYZ" });
  });
});
