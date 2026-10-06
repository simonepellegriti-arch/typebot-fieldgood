import { describe, expect, it } from "bun:test";
import { buildAssistantReply } from "./questionnaireAssistantPrompt";
import { parseGeneratedQuestionnaireSpec } from "./questionnaireSpecGenerationSchema";

describe("parseGeneratedQuestionnaireSpec", () => {
  it("accepts AI answers with missing nullable fields and loose formats", () => {
    const result = parseGeneratedQuestionnaireSpec({
      title: "Viaggi",
      language: "it",
      questions: [
        {
          code: "S1",
          type: "number",
          text: "Quanti anni ha?",
          scale: { min: "18", max: 99 },
          terminateIf: {
            logic: "ALL",
            conditions: [
              { questionCode: "S1", operator: "less_than", values: 18 },
            ],
          },
        },
        {
          code: "D4",
          type: "constant_sum",
          text: "Distribuisca 100 punti",
          rows: [{ code: 1, label: "Prezzo" }],
          total: "100",
          showIf: { logic: "all", conditions: [] },
        },
      ],
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    const [age, constantSum] = result.data.questions;
    expect(result.data.notes).toEqual([]);
    expect(result.data.introText).toBeNull();
    expect(age?.scale).toEqual({
      min: 18,
      max: 99,
      minLabel: null,
      maxLabel: null,
    });
    expect(age?.options).toEqual([]);
    expect(age?.terminateIf).toEqual({
      logic: "all",
      conditions: [
        { questionCode: "S1", operator: "lessThan", values: ["18"] },
      ],
    });
    expect(constantSum?.type).toBe("constantSum");
    expect(constantSum?.rows).toEqual([{ code: "1", label: "Prezzo" }]);
    expect(constantSum?.total).toBe(100);
    expect(constantSum?.showIf).toBeNull();
    expect(constantSum?.isRandomized).toBe(false);
  });

  it("rejects unknown question types", () => {
    const result = parseGeneratedQuestionnaireSpec({
      title: "x",
      language: "it",
      questions: [{ code: "D1", type: "hologram", text: "?" }],
    });
    expect(result.success).toBe(false);
  });
});

describe("buildAssistantReply", () => {
  it("writes a readable Italian summary", () => {
    expect(
      buildAssistantReply({
        isNewBot: true,
        questionCount: 1,
        filterCount: 0,
        screenOutCount: 0,
      }),
    ).toBe("Ho creato il bot con 1 domanda.");
    expect(
      buildAssistantReply({
        isNewBot: false,
        questionCount: 8,
        filterCount: 2,
        screenOutCount: 1,
      }),
    ).toBe(
      "Ho aggiornato il bot con 8 domande, 2 filtri e 1 chiusura anticipata (screen-out).",
    );
  });
});

describe("FieldGood defaults", () => {
  it("lets every open answer be typed or recorded, with the microphone test", () => {
    const parsed = parseGeneratedQuestionnaireSpec({
      title: "Prova",
      airtable: { baseId: "appX", tableId: "tblY" },
      questions: [
        { code: "A1", type: "openLong", text: "Raccontami" },
        { code: "A2", type: "open", text: "Perché?", media: "video" },
        { code: "A3", type: "single", text: "Scegli", options: [] },
      ],
    });
    expect(parsed.success).toBe(true);
    expect(parsed.data?.questions.map((question) => question.media)).toEqual([
      "voice",
      "video",
      null,
    ]);
    expect(parsed.data?.voiceTest).toBe(true);
    expect(parsed.data?.airtable).toBeNull();
  });
});
