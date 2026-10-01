import { describe, expect, it } from "bun:test";
import { runTestInterview } from "../../../test/runTestInterview";

const text = (id: string, content: string) => ({
  id,
  type: "text",
  content: { richText: [{ type: "p", children: [{ text: content }] }] },
});

const buildTypebot = (loopOptions: Record<string, unknown>) => ({
  version: "6",
  id: "loop-bot",
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
    { id: "v_brands", name: "BRANDS" },
    { id: "v_item", name: "ITEM" },
    { id: "v_iter", name: "ITER" },
    { id: "v_index", name: "INDEX" },
    { id: "v_d2", name: "D2" },
    { id: "v_total", name: "TOTAL_SCORE" },
    { id: "v_list", name: "LIST", value: "Alpha, Beta, Gamma" },
  ],
  groups: [
    {
      id: "g1",
      title: "Main",
      graphCoordinates: { x: 0, y: 0 },
      blocks: [
        {
          id: "b_brands",
          type: "choice input",
          items: [
            { id: "n1", content: "Nike", value: "1" },
            { id: "n2", content: "Adidas", value: "2" },
            { id: "n3", content: "Puma", value: "3" },
          ],
          options: { variableId: "v_brands", isMultipleChoice: true },
        },
        {
          id: "b_loop",
          type: "Loop",
          options: {
            bodyGroupId: "g_body",
            currentItemVariableId: "v_item",
            iterationNumberVariableId: "v_iter",
            currentIndexVariableId: "v_index",
            ...loopOptions,
          },
        },
        text("t_end", "Fine del ciclo, totale {{TOTAL_SCORE}}"),
        {
          id: "b_d3",
          type: "text input",
          options: {},
        },
      ],
    },
    {
      id: "g_body",
      title: "Per ogni marca",
      graphCoordinates: { x: 400, y: 0 },
      blocks: [
        text("t_q", "Come valuti {{ITEM}} ({{ITER}})?"),
        {
          id: "b_d2",
          type: "choice input",
          items: [
            { id: "s1", content: "Pessima", value: "1", score: -2 },
            { id: "s2", content: "Buona", value: "2", score: 5 },
            { id: "s3", content: "Ottima", value: "3", score: 10 },
          ],
          options: {
            variableId: "v_d2",
            scoreTargets: [
              { id: "st1", variableId: "v_total", operation: "add" },
            ],
          },
        },
      ],
    },
  ],
});

const runInterview = (
  loopOptions: Record<string, unknown>,
  replies: string[],
) => runTestInterview(buildTypebot(loopOptions), replies);

describe("Loop block", () => {
  it("asks the body once per selected answer and stores the iteration of each answer", async () => {
    const { transcript, inputBlockIds, variables, state, answers } =
      await runInterview({ sourceType: "answers", sourceBlockId: "b_brands" }, [
        "Nike, Puma",
        "Ottima",
        "Pessima",
      ]);
    expect(inputBlockIds).toEqual(["b_brands", "b_d2", "b_d2", "b_d3"]);
    expect(transcript.join("\n")).toContain("Come valuti Nike (1)?");
    expect(transcript.join("\n")).toContain("Come valuti Puma (2)?");
    expect(transcript.join("\n")).toContain("Fine del ciclo, totale 8");
    const loopAnswers = answers.filter((answer) => answer.blockId === "b_d2");
    expect(loopAnswers).toEqual([
      expect.objectContaining({
        value: "3",
        valueLabel: "Ottima",
        score: 10,
        loopBlockId: "b_loop",
        loopIteration: 0,
        loopItem: "1",
      }),
      expect.objectContaining({
        value: "1",
        valueLabel: "Pessima",
        score: -2,
        loopBlockId: "b_loop",
        loopIteration: 1,
        loopItem: "3",
      }),
    ]);
    expect(
      answers.find((answer) => answer.blockId === "b_brands"),
    ).not.toHaveProperty("loopBlockId");
    expect(variables.TOTAL_SCORE).toBe("8");
    expect(variables.ITEM).toBe("Puma");
    expect(variables.INDEX).toBe("1");
    expect(state.loops ?? []).toEqual([]);
  });

  it("repeats a fixed number of times", async () => {
    const { inputBlockIds, answers } = await runInterview(
      { sourceType: "count", count: 3 },
      ["Nike", "Buona", "Buona", "Buona"],
    );
    expect(inputBlockIds).toEqual(["b_brands", "b_d2", "b_d2", "b_d2", "b_d3"]);
    expect(
      answers
        .filter((answer) => answer.blockId === "b_d2")
        .map((answer) => [answer.loopIteration, answer.loopItem]),
    ).toEqual([
      [0, "1"],
      [1, "2"],
      [2, "3"],
    ]);
  });

  it("loops on a list variable and stops on the break condition", async () => {
    const { inputBlockIds, transcript } = await runInterview(
      {
        sourceType: "list",
        sourceVariableId: "v_list",
        breakCondition: {
          isEnabled: true,
          condition: {
            logicalOperator: "AND",
            comparisons: [
              {
                id: "c1",
                variableId: "v_total",
                comparisonOperator: "Greater than",
                value: "9",
              },
            ],
          },
        },
      },
      ["Nike", "Ottima", "Buona"],
    );
    // Alpha: 10 points → break before Beta.
    expect(inputBlockIds).toEqual(["b_brands", "b_d2", "b_d3", undefined]);
    expect(transcript.join("\n")).toContain("Come valuti Alpha (1)?");
    expect(transcript.join("\n")).not.toContain("Beta");
  });

  it("skips iterations matching the continue condition", async () => {
    const { transcript, answers } = await runInterview(
      {
        sourceType: "list",
        sourceVariableId: "v_list",
        continueCondition: {
          isEnabled: true,
          condition: {
            logicalOperator: "AND",
            comparisons: [
              {
                id: "c1",
                variableId: "v_item",
                comparisonOperator: "Equal to",
                value: "Beta",
              },
            ],
          },
        },
      },
      ["Nike", "Buona", "Buona"],
    );
    const fullTranscript = transcript.join("\n");
    expect(fullTranscript).toContain("Come valuti Alpha (1)?");
    expect(fullTranscript).not.toContain("Come valuti Beta");
    expect(fullTranscript).toContain("Come valuti Gamma (3)?");
    expect(
      answers
        .filter((answer) => answer.blockId === "b_d2")
        .map((answer) => answer.loopItem),
    ).toEqual(["Alpha", "Gamma"]);
  });

  it("leaves through the next block when there is nothing to loop on", async () => {
    const { inputBlockIds } = await runInterview(
      { sourceType: "list", sourceVariableId: "v_brands_missing" },
      ["Nike"],
    );
    expect(inputBlockIds).toEqual(["b_brands", "b_d3"]);
  });

  it("repeats a whole section of several questions spread over linked groups", async () => {
    const baseTypebot = buildTypebot({
      sourceType: "answers",
      sourceBlockId: "b_brands",
    });
    // Second question in the same group, then the section continues in another group.
    const sectionPart1Blocks: unknown[] = [
      { id: "b_d2b", type: "text input", options: { variableId: "v_d2b" } },
      {
        ...text("b_jump", "Ultima domanda su {{ITEM}}"),
        outgoingEdgeId: "e_part2",
      },
    ];
    const typebot = {
      ...baseTypebot,
      variables: [
        ...baseTypebot.variables,
        { id: "v_d2b", name: "D2B" },
        { id: "v_d2c", name: "D2C" },
      ],
      edges: [
        ...baseTypebot.edges,
        {
          id: "e_part2",
          from: { blockId: "b_jump" },
          to: { groupId: "g_body2" },
        },
      ],
      groups: [
        ...baseTypebot.groups.map((group) =>
          group.id === "g_body"
            ? { ...group, blocks: [...group.blocks, ...sectionPart1Blocks] }
            : group,
        ),
        {
          id: "g_body2",
          title: "Per ogni marca (parte 2)",
          graphCoordinates: { x: 800, y: 0 },
          blocks: [
            {
              id: "b_d2c",
              type: "text input",
              options: { variableId: "v_d2c" },
            },
          ],
        },
      ],
    };
    const { inputBlockIds, transcript, answers } = await runTestInterview(
      typebot,
      [
        "Nike, Puma",
        "Ottima",
        "Comoda",
        "La comprerei",
        "Pessima",
        "Cara",
        "No",
        "Fine",
      ],
    );
    expect(inputBlockIds).toEqual([
      "b_brands",
      "b_d2",
      "b_d2b",
      "b_d2c",
      "b_d2",
      "b_d2b",
      "b_d2c",
      "b_d3",
    ]);
    expect(transcript.join("\n")).toContain("Ultima domanda su Puma");
    expect(
      answers
        .filter((answer) => answer.loopBlockId === "b_loop")
        .map((answer) => [answer.blockId, answer.loopItem, answer.value]),
    ).toEqual([
      ["b_d2", "1", "3"],
      ["b_d2b", "1", "Comoda"],
      ["b_d2c", "1", "La comprerei"],
      ["b_d2", "3", "1"],
      ["b_d2b", "3", "Cara"],
      ["b_d2c", "3", "No"],
    ]);
  });
});
