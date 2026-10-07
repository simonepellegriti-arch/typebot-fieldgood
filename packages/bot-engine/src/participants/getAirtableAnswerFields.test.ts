import { describe, expect, it } from "bun:test";
import type { SessionState } from "@typebot.io/chat-session/schemas";
import { getAirtableAnswerFields } from "./getAirtableAnswerFields";

const state = {
  typebotsQueue: [
    {
      typebot: {
        groups: [
          {
            id: "g1",
            title: "Q1",
            blocks: [
              {
                id: "b1",
                type: "choice input",
                items: [
                  { id: "i1", content: "Molto", value: "1" },
                  { id: "i2", content: "Poco", value: "2" },
                ],
                options: { variableId: "vQ1" },
              },
              {
                id: "b2",
                type: "matrix input",
                options: {
                  variableId: "vQ2",
                  rows: [{ id: "r1", label: "Prezzo", value: "1" }],
                  columns: [{ id: "c1", label: "Sì", value: "1" }],
                },
              },
            ],
          },
        ],
        variables: [
          { id: "vQ1", name: "Q1", value: "1, 2" },
          { id: "vQ2", name: "Q2", value: '{"1":"1"}' },
          { id: "vQ3", name: "Q3", value: "testo" },
          { id: "vPanel", name: "panel", value: "TEST" },
          { id: "vHelper", name: "Q1_AI1", value: "domanda" },
        ],
      },
    },
  ],
} as unknown as SessionState;

describe("getAirtableAnswerFields", () => {
  it("writes labels for choices and grids, only to existing fields", () => {
    expect(
      getAirtableAnswerFields(state, {
        fieldNames: ["Q1", "Q2", "Q3", "panel"],
        excludedNames: new Set(["panel"]),
      }),
    ).toEqual({ Q1: "Molto, Poco", Q2: "Prezzo: Sì", Q3: "testo" });
  });

  it("writes each answer under its question title when one is set", () => {
    expect(
      getAirtableAnswerFields(state, {
        fieldNames: ["Livello di gradimento", "Q2", "Q3"],
        excludedNames: new Set(),
        fieldMap: { Q1: "Livello di gradimento", Q3: "Commento libero" },
      }),
    ).toEqual({ "Livello di gradimento": "Molto, Poco", Q2: "Prezzo: Sì" });
  });
});
