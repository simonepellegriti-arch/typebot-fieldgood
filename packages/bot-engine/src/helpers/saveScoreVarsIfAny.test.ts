import { describe, expect, it } from "bun:test";
import { runTestInterview } from "../test/runTestInterview";

const text = (id: string, content: string) => ({
  id,
  type: "text",
  content: { richText: [{ type: "p", children: [{ text: content }] }] },
});

const scoreBot = {
  version: "6",
  id: "score-bot",
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
  edges: [
    { id: "e_start", from: { eventId: "start" }, to: { groupId: "g1" } },
    {
      id: "e_high",
      from: { blockId: "b_condition", itemId: "ci_high" },
      to: { groupId: "g_high" },
    },
    { id: "e_low", from: { blockId: "b_condition" }, to: { groupId: "g_low" } },
  ],
  variables: [
    { id: "v_d1", name: "D1" },
    { id: "v_d6", name: "D6" },
    { id: "v_d10", name: "D10" },
    { id: "v_total", name: "TOTAL_SCORE" },
    { id: "v_brand", name: "BRAND_SCORE" },
    { id: "v_penalty", name: "PENALTY", value: "100" },
    { id: "v_weighted", name: "WEIGHTED", value: "2" },
  ],
  groups: [
    {
      id: "g1",
      title: "Questions",
      graphCoordinates: { x: 0, y: 0 },
      blocks: [
        {
          id: "b_d1",
          type: "choice input",
          items: [
            { id: "a1", content: "Molto", value: "1", score: 3 },
            { id: "a2", content: "Poco", value: "2", score: -1 },
            { id: "a99", content: "Non so", value: "99" },
          ],
          options: {
            variableId: "v_d1",
            scoreTargets: [
              { id: "t1", variableId: "v_total", operation: "add" },
              { id: "t2", variableId: "v_penalty", operation: "subtract" },
              { id: "t3", variableId: "v_weighted", operation: "multiply" },
            ],
          },
        },
        {
          id: "b_d6",
          type: "choice input",
          items: [
            { id: "k1", content: "Nike", value: "1", score: 4 },
            { id: "k2", content: "Adidas", value: "2", score: 2 },
            { id: "k3", content: "Puma", value: "3" },
          ],
          options: {
            variableId: "v_d6",
            isMultipleChoice: true,
            scoreTargets: [
              { id: "t4", variableId: "v_total", operation: "add" },
              { id: "t5", variableId: "v_brand", operation: "set" },
            ],
          },
        },
        {
          id: "b_d10",
          type: "matrix input",
          options: {
            variableId: "v_d10",
            rows: [
              { id: "r1", label: "Qualità", value: "1" },
              { id: "r2", label: "Prezzo", value: "2" },
            ],
            columns: [
              { id: "c1", label: "Basso", value: "1", score: 0 },
              { id: "c2", label: "Alto", value: "2", score: 5 },
            ],
            scoreTargets: [
              { id: "t6", variableId: "v_total", operation: "add" },
            ],
          },
        },
        {
          id: "b_condition",
          type: "Condition",
          outgoingEdgeId: "e_low",
          items: [
            {
              id: "ci_high",
              outgoingEdgeId: "e_high",
              content: {
                logicalOperator: "AND",
                comparisons: [
                  {
                    id: "cmp",
                    variableId: "v_total",
                    comparisonOperator: "Greater than",
                    value: "14",
                  },
                ],
              },
            },
          ],
        },
      ],
    },
    {
      id: "g_high",
      title: "High",
      graphCoordinates: { x: 400, y: 0 },
      blocks: [text("t_high", "Profilo alto {{TOTAL_SCORE}}")],
    },
    {
      id: "g_low",
      title: "Low",
      graphCoordinates: { x: 400, y: 200 },
      blocks: [text("t_low", "Profilo basso {{TOTAL_SCORE}}")],
    },
  ],
};

const matrixReply = (answers: Record<string, string[]>) => ({
  type: "text" as const,
  text: "",
  structuredReply: { type: "matrix" as const, answers },
});

describe("scores", () => {
  it("keeps codes and scores apart and feeds several score variables", async () => {
    const { variables, transcript, answers } = await runTestInterview(
      scoreBot,
      ["Molto", "Nike, Puma", matrixReply({ r1: ["c2"], r2: ["c1"] })],
    );
    const answersByBlock = Object.fromEntries(
      answers.map((answer) => [answer.blockId, answer]),
    );
    expect(answersByBlock.b_d1).toMatchObject({ value: "1", score: 3 });
    // Puma has no score: the sum only uses scored options.
    expect(answersByBlock.b_d6).toMatchObject({ value: ["1", "3"], score: 4 });
    expect(answersByBlock.b_d10).toMatchObject({
      score: 5,
      details: { rowScores: { "1": 5, "2": 0 } },
    });
    expect(variables).toMatchObject({
      TOTAL_SCORE: "12",
      BRAND_SCORE: "4",
      PENALTY: "97",
      WEIGHTED: "6",
    });
    expect(transcript.join("\n")).toContain("Profilo basso 12");
  });

  it("routes with a condition on the score", async () => {
    const { transcript } = await runTestInterview(scoreBot, [
      "Molto",
      "Nike, Adidas",
      matrixReply({ r1: ["c2"], r2: ["c2"] }),
    ]);
    // 3 + 6 + 10 = 19 > 14
    expect(transcript.join("\n")).toContain("Profilo alto 19");
  });

  it("stores a null score (not 0) when the option has none", async () => {
    const { variables, answers } = await runTestInterview(scoreBot, [
      "Non so",
      "Puma",
      matrixReply({ r1: ["c1"], r2: ["c1"] }),
    ]);
    const answersByBlock = Object.fromEntries(
      answers.map((answer) => [answer.blockId, answer]),
    );
    expect(answersByBlock.b_d1?.score ?? null).toBeNull();
    expect(answersByBlock.b_d6?.score ?? null).toBeNull();
    expect(answersByBlock.b_d10).toMatchObject({ score: 0 });
    // Untouched by unscored answers; the matrix adds 0.
    expect(variables).toMatchObject({ PENALTY: "100", WEIGHTED: "2" });
    expect(variables.TOTAL_SCORE).toBe("0");
    expect(variables.BRAND_SCORE).toBeUndefined();
  });
});
