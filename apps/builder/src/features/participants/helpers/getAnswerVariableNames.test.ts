import { describe, expect, it } from "bun:test";
import { getAnswerVariableNames } from "./getAnswerVariableNames";

const variables = [
  { id: "v1", name: "Q1" },
  { id: "v2", name: "Q1_URL" },
  { id: "v3", name: "Q1_TRASCRIZIONE" },
  { id: "v4", name: "test_vocale" },
  { id: "v5", name: "test_vocale_URL" },
];

describe("getAnswerVariableNames", () => {
  it("adds the GPT transcription of a voice answer after its audio link", () => {
    const groups = [
      {
        blocks: [
          {
            type: "text input",
            options: {
              variableId: "v4",
              audioClip: { isEnabled: true, saveVariableId: "v5" },
            },
          },
          {
            type: "openai",
            options: {
              action: "Create transcription",
              transcriptionVariableId: "v4",
            },
          },
        ],
      },
      {
        blocks: [
          {
            type: "text input",
            options: {
              variableId: "v1",
              audioClip: { isEnabled: true, saveVariableId: "v2" },
            },
          },
          { type: "Condition", items: [] },
          {
            type: "openai",
            options: {
              action: "Create transcription",
              transcriptionVariableId: "v3",
            },
          },
          {
            type: "openai",
            options: { action: "Generate variables", variableId: "v1" },
          },
        ],
      },
    ];
    expect(getAnswerVariableNames(groups, variables)).toEqual([
      "Q1",
      "Q1_URL",
      "Q1_TRASCRIZIONE",
    ]);
  });
});
