import { describe, expect, it } from "bun:test";
import type { ChoiceInputBlock } from "@typebot.io/blocks-inputs/choice/schema";
import { InputBlockType } from "@typebot.io/blocks-inputs/constants";
import { addChoiceScores } from "./addChoiceScores";
import { parseChoiceStructuredReply } from "./parseChoiceStructuredReply";
import { randomizeChoiceItems } from "./randomizeChoiceItems";

const clip = (name: string) => ({
  type: "video" as const,
  url: `https://cdn.example.com/${name}.mp4`,
  fallbackUrl: `https://cdn.example.com/${name}.webm`,
});

const clipItems: ChoiceInputBlock["items"] = [
  { id: "spot_a", content: "Spot A", value: "1", media: clip("a"), score: 2 },
  { id: "spot_b", content: "Spot B", value: "2", media: clip("b"), score: 1 },
  { id: "spot_c", content: "Spot C", value: "3", media: clip("c") },
  { id: "none", content: "Nessuno", value: "99", isExclusive: true },
];

const watched = (watchedPercentage: number, isCompleted = false) => ({
  watchedPercentage,
  watchedSeconds: watchedPercentage / 10,
  isCompleted,
});

describe("video clips as answer options", () => {
  it("saves the option code and the viewing of every clip, by code", () => {
    const reply = parseChoiceStructuredReply(
      {
        type: "choice",
        itemIds: ["spot_b"],
        mediaWatch: {
          spot_a: watched(40),
          spot_b: watched(100, true),
          spot_c: watched(0),
        },
      },
      { items: clipItems, options: {} },
    );
    expect(reply).toMatchObject({
      status: "success",
      content: "2",
      structuredAnswer: {
        value: "2",
        label: "Spot B",
        details: {
          mediaWatch: {
            "1": watched(40),
            "2": watched(100, true),
            "3": watched(0),
          },
        },
      },
    });
  });

  it("refuses a clip that was not watched enough when watching is required", () => {
    const options = {
      requireWatchBeforeSelect: true,
      minimumWatchPercentage: 75,
    };
    expect(
      parseChoiceStructuredReply(
        {
          type: "choice",
          itemIds: ["spot_a"],
          mediaWatch: { spot_a: watched(50) },
        },
        { items: clipItems, options },
      ),
    ).toEqual({ status: "fail" });
    expect(
      parseChoiceStructuredReply(
        { type: "choice", itemIds: ["spot_a"] },
        { items: clipItems, options },
      ),
    ).toEqual({ status: "fail" });
    expect(
      parseChoiceStructuredReply(
        {
          type: "choice",
          itemIds: ["spot_a"],
          mediaWatch: { spot_a: watched(80) },
        },
        { items: clipItems, options },
      ).status,
    ).toBe("success");
    // Options without a clip are never blocked.
    expect(
      parseChoiceStructuredReply(
        { type: "choice", itemIds: ["none"] },
        { items: clipItems, options },
      ).status,
    ).toBe("success");
  });

  it("supports multiple selection of clips, each with its own viewing", () => {
    const reply = parseChoiceStructuredReply(
      {
        type: "choice",
        itemIds: ["spot_a", "spot_c"],
        mediaWatch: { spot_a: watched(100, true), spot_c: watched(90) },
      },
      {
        items: clipItems,
        options: {
          isMultipleChoice: true,
          requireWatchBeforeSelect: true,
        },
      },
    );
    expect(reply).toMatchObject({
      status: "success",
      structuredAnswer: { value: ["1", "3"] },
    });
    expect(addChoiceScores(reply, { items: clipItems })).toMatchObject({
      structuredAnswer: { score: 2 },
    });
  });

  it("randomizes the display order without changing ids or codes", () => {
    const block: ChoiceInputBlock = {
      id: "b",
      type: InputBlockType.CHOICE,
      items: clipItems,
      options: { areItemsRandomized: true },
    };
    let seed = 0.9;
    const randomized = randomizeChoiceItems(block, () => {
      seed = (seed * 7) % 1;
      return seed;
    });
    expect(randomized.items.map((item) => item.id).sort()).toEqual(
      clipItems.map((item) => item.id).sort(),
    );
    // The exclusive option stays anchored at the end.
    expect(randomized.items.at(-1)?.id).toBe("none");
    for (const item of randomized.items)
      expect(item).toEqual(clipItems.find(({ id }) => id === item.id)!);
    expect(
      randomizeChoiceItems({ ...block, options: {} }).items.map(({ id }) => id),
    ).toEqual(clipItems.map(({ id }) => id));
  });
});
