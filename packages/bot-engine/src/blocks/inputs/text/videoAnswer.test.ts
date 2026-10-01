import { describe, expect, it } from "bun:test";
import { runTestInterview } from "../../../test/runTestInterview";

const buildOpenQuestionBot = (videoClip: Record<string, unknown>) => ({
  version: "6",
  id: "video-answer-bot",
  events: [
    {
      id: "start",
      type: "start",
      graphCoordinates: { x: 0, y: 0 },
      outgoingEdgeId: "e0",
    },
  ],
  edges: [{ id: "e0", from: { eventId: "start" }, to: { groupId: "g1" } }],
  variables: [
    { id: "v_d7", name: "D7" },
    { id: "v_d7_video", name: "D7_VIDEO" },
  ],
  groups: [
    {
      id: "g1",
      title: "Open question",
      graphCoordinates: { x: 0, y: 0 },
      blocks: [
        {
          id: "t1",
          type: "text",
          content: {
            richText: [
              { type: "p", children: [{ text: "Cosa ne pensi dello spot?" }] },
            ],
          },
        },
        {
          id: "b_d7",
          type: "text input",
          options: { variableId: "v_d7", videoClip },
        },
        {
          id: "t2",
          type: "text",
          content: {
            richText: [
              { type: "p", children: [{ text: "Grazie! {{D7_VIDEO}}" }] },
            ],
          },
        },
      ],
    },
  ],
});

const videoUrl = "https://storage.example.com/public/answers/video-answer.mp4";

describe("video answer of an open question", () => {
  it("saves the clip URL as the answer and in its variable", async () => {
    const { answers, variables, transcript } = await runTestInterview(
      buildOpenQuestionBot({ isEnabled: true, saveVariableId: "v_d7_video" }),
      [{ type: "video", url: videoUrl }],
    );
    expect(answers).toEqual([
      expect.objectContaining({ blockId: "b_d7", content: videoUrl }),
    ]);
    // Like voice messages, the clip URL goes to its own variable; the answer
    // (exported in the D7 column) is the URL.
    expect(variables).toMatchObject({ D7_VIDEO: videoUrl });
    expect(transcript.join("\n")).toContain(`Grazie! ${videoUrl}`);
  });

  it("still accepts a written answer", async () => {
    const { answers, variables } = await runTestInterview(
      buildOpenQuestionBot({ isEnabled: true, saveVariableId: "v_d7_video" }),
      ["Mi è piaciuto"],
    );
    expect(answers).toEqual([
      expect.objectContaining({ content: "Mi è piaciuto" }),
    ]);
    expect(variables.D7_VIDEO).toBeUndefined();
  });

  it("refuses a video when the question doesn't allow it", async () => {
    const { answers, inputBlockIds } = await runTestInterview(
      buildOpenQuestionBot({ isEnabled: false }),
      [{ type: "video", url: videoUrl }],
    );
    expect(answers).toEqual([]);
    // The question is asked again.
    expect(inputBlockIds.at(-1)).toBe("b_d7");
  });
});
