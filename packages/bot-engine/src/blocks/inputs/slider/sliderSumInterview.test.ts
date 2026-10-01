import { describe, expect, it } from "bun:test";
import { runTestInterview } from "../../../test/runTestInterview";

const typebot = {
  version: "6",
  id: "slider-bot",
  isArchived: false,
  updatedAt: new Date(),
  workspaceId: "ws",
  settings: {},
  theme: {},
  events: [
    {
      id: "start",
      type: "start",
      graphCoordinates: { x: 0, y: 0 },
      outgoingEdgeId: "e_start",
    },
  ],
  edges: [{ id: "e_start", from: { eventId: "start" }, to: { groupId: "g1" } }],
  variables: [
    { id: "v_d1", name: "D1" },
    { id: "v_d2", name: "D2" },
  ],
  groups: [
    {
      id: "g1",
      title: "Main",
      graphCoordinates: { x: 0, y: 0 },
      blocks: [
        {
          id: "b_d1",
          type: "slider input",
          options: { variableId: "v_d1", question: "Quanto ti piace?" },
        },
        {
          id: "b_d2",
          type: "constant sum input",
          options: {
            variableId: "v_d2",
            items: [
              { id: "k1", label: "Prezzo", value: "1" },
              { id: "k2", label: "Qualità", value: "2" },
            ],
          },
        },
        {
          id: "t_end",
          type: "text",
          content: {
            richText: [
              { type: "p", children: [{ text: "D1={{D1}} D2={{D2}}" }] },
            ],
          },
        },
      ],
    },
  ],
};

describe("slider and constant sum in an interview", () => {
  it("saves plain numbers and asks again until the total is 100", async () => {
    const { inputBlockIds, answers, transcript } = await runTestInterview(
      typebot,
      [
        {
          type: "text",
          text: "-40",
          structuredReply: { type: "slider", values: { slider: -40 } },
        },
        {
          type: "text",
          text: "",
          structuredReply: { type: "constantSum", values: { k1: 50, k2: 40 } },
        },
        {
          type: "text",
          text: "",
          structuredReply: { type: "constantSum", values: { k1: 55, k2: 45 } },
        },
      ],
    );
    expect(inputBlockIds).toEqual(["b_d1", "b_d2", "b_d2", undefined]);
    expect(answers.map((answer) => [answer.blockId, answer.value])).toEqual([
      ["b_d1", -40],
      ["b_d2", { "1": 55, "2": 45 }],
    ]);
    expect(transcript.join("\n")).toContain('D1=-40 D2={"1":55,"2":45}');
  });
});
