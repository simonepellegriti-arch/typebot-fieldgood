import { describe, expect, it } from "bun:test";
import { buildColumnHeaders } from "./buildColumnHeaders";
import { getAnswerColumns } from "./getAnswerColumns";

const variables = [
  "test_vocale",
  "test_vocale_URL",
  "A1",
  "A1_URL",
  "A1_TRASCRIZIONE",
  "A1_AI1",
  "A1_R1",
  "A1_R1_URL",
  "A1_R1_TRASCRIZIONE",
  "G1_GAV",
  "G1_GAV_VISIONE",
  "G1_ESO",
].map((name) => ({ id: `v_${name}`, name }));

const bubble = (text: string, note?: string) => ({
  type: "text",
  content: {
    richText: [
      { type: "p", children: [{ text }] },
      ...(note
        ? [{ type: "p", children: [{ text: note, italic: true }] }]
        : []),
    ],
  },
});
const voiceInput = (name: string) => ({
  type: "text input",
  options: {
    variableId: `v_${name}`,
    audioClip: { isEnabled: true, saveVariableId: `v_${name}_URL` },
  },
});
const transcription = (name: string) => ({
  type: "openai",
  options: {
    action: "Create transcription",
    url: `{{${name}_URL}}`,
    transcriptionVariableId: `v_${name}_TRASCRIZIONE`,
  },
});

const groups = [
  {
    title: "Test microfono",
    blocks: [
      bubble("Leggi questa frase"),
      voiceInput("test_vocale"),
      {
        type: "openai",
        options: {
          action: "Create transcription",
          url: "{{test_vocale_URL}}",
          transcriptionVariableId: "v_test_vocale",
        },
      },
    ],
  },
  {
    title: "A1",
    blocks: [
      bubble("Che cosa fai nella vita?", "Puoi rispondere a voce"),
      voiceInput("A1"),
      { type: "Condition", items: [] },
      transcription("A1"),
      bubble("{{A1_AI1}}"),
      voiceInput("A1_R1"),
      transcription("A1_R1"),
    ],
  },
  {
    title: "G1 Gaviscon",
    blocks: [
      {
        type: "video",
        content: {
          url: "x",
          watchTracking: { variableId: "v_G1_GAV_VISIONE" },
        },
      },
      bubble("Quanto ti è piaciuto lo spot?"),
      { type: "choice input", options: { variableId: "v_G1_GAV" } },
    ],
  },
  {
    title: "G1 Esoxx",
    blocks: [
      bubble("Quanto ti è piaciuto lo spot?"),
      { type: "choice input", options: { variableId: "v_G1_ESO" } },
    ],
  },
];

describe("getAnswerColumns", () => {
  it("links every column to its question, in flow order", () => {
    const columns = getAnswerColumns(groups, variables);
    expect(
      columns.map((column) => [
        column.variableName,
        column.kind,
        column.baseName,
        column.round,
      ]),
    ).toEqual([
      ["A1", "answer", "A1", undefined],
      ["A1_URL", "audio", "A1", undefined],
      ["A1_TRASCRIZIONE", "transcription", "A1", undefined],
      ["A1_R1", "answer", "A1", 1],
      ["A1_R1_URL", "audio", "A1", 1],
      ["A1_R1_TRASCRIZIONE", "transcription", "A1", 1],
      ["G1_GAV_VISIONE", "watch", "G1_GAV", undefined],
      ["G1_GAV", "answer", "G1_GAV", undefined],
      ["G1_ESO", "answer", "G1_ESO", undefined],
    ]);
    expect(columns[0]?.questionText).toBe("Che cosa fai nella vita?");
    expect(columns[3]?.questionText).toBe("Che cosa fai nella vita?");
  });
});

describe("buildColumnHeaders", () => {
  it("titles columns with the short question and keeps them unique", () => {
    const headers = buildColumnHeaders({
      columns: getAnswerColumns(groups, variables),
      titlesByQuestion: new Map([
        ["A1", "Lavoro e stile di vita"],
        ["G1_GAV", "Gradimento spot"],
        ["G1_ESO", "Gradimento spot"],
      ]),
      currentHeaders: { A1_URL: "Vocale lavoro" },
      reservedHeaders: ["ID", "Stato"],
    });
    expect(headers).toEqual({
      A1: "Lavoro e stile di vita",
      A1_URL: "Vocale lavoro",
      A1_TRASCRIZIONE: "Lavoro e stile di vita – trascrizione",
      A1_R1: "Lavoro e stile di vita – rilancio 1",
      A1_R1_URL: "Lavoro e stile di vita – rilancio 1 audio",
      A1_R1_TRASCRIZIONE: "Lavoro e stile di vita – rilancio 1 trascrizione",
      G1_GAV_VISIONE: "Gradimento spot (G1_GAV) – visione video (%)",
      G1_GAV: "Gradimento spot (G1_GAV)",
      G1_ESO: "Gradimento spot (G1_ESO)",
    });
  });
});
