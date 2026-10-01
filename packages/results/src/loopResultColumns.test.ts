import { describe, expect, it } from "bun:test";
import { groupV6Schema } from "@typebot.io/groups/schemas";
import { z } from "zod";
import { convertResultsToTableData } from "./convertResultsToTableData";
import { parseResultHeader } from "./parseResultHeader";
import type { ResultWithAnswers } from "./schemas/results";

const text = (id: string) => ({
  id,
  type: "text",
  content: { richText: [{ type: "p", children: [{ text: id }] }] },
});

const groups = [
  {
    id: "g_main",
    title: "Main",
    graphCoordinates: { x: 0, y: 0 },
    blocks: [
      {
        id: "b_brands",
        type: "choice input",
        items: [
          { id: "i1", content: "Nike", value: "1" },
          { id: "i2", content: "Adidas", value: "2" },
          { id: "i3", content: "Puma", value: "3" },
        ],
        options: { variableId: "v_d1", isMultipleChoice: true },
      },
      {
        id: "b_loop",
        type: "Loop",
        options: {
          sourceType: "answers",
          sourceBlockId: "b_brands",
          bodyGroupId: "g_body",
        },
      },
      {
        id: "b_family",
        type: "Loop",
        options: { sourceType: "count", bodyGroupId: "g_person" },
      },
    ],
  },
  {
    id: "g_body",
    title: "Per marca",
    graphCoordinates: { x: 0, y: 0 },
    blocks: [
      text("t1"),
      { id: "b_d2", type: "text input", options: { variableId: "v_d2" } },
    ],
  },
  {
    id: "g_person",
    title: "Per persona",
    graphCoordinates: { x: 0, y: 0 },
    blocks: [
      { id: "b_d3", type: "number input", options: { variableId: "v_d3" } },
    ],
  },
];

const variables = [
  { id: "v_d1", name: "D1" },
  { id: "v_d2", name: "D2" },
  { id: "v_d3", name: "D3" },
];

const buildResult = (
  id: string,
  answers: ResultWithAnswers["answers"],
  resultVariables: ResultWithAnswers["variables"],
): ResultWithAnswers => ({
  id,
  createdAt: new Date("2026-10-01T10:00:00Z"),
  typebotId: "t",
  variables: resultVariables,
  isCompleted: true,
  hasStarted: true,
  isArchived: false,
  lastChatSessionId: null,
  completedAt: null,
  publishedVersionId: null,
  publishedVersionNumber: null,
  answers,
});

const results = [
  buildResult(
    "r1",
    [
      { blockId: "b_brands", content: "Nike, Puma" },
      {
        blockId: "b_d2",
        content: "Comode",
        loopBlockId: "b_loop",
        loopIteration: 0,
        loopItem: "1",
      },
      {
        blockId: "b_d2",
        content: "Care",
        loopBlockId: "b_loop",
        loopIteration: 1,
        loopItem: "3",
      },
      {
        blockId: "b_d3",
        content: "45",
        loopBlockId: "b_family",
        loopIteration: 0,
        loopItem: "1",
      },
      {
        blockId: "b_d3",
        content: "12",
        loopBlockId: "b_family",
        loopIteration: 1,
        loopItem: "2",
      },
    ],
    [
      { id: "v_d2", name: "D2", value: "Care" },
      { id: "v_d3", name: "D3", value: "12" },
    ],
  ),
  buildResult(
    "r2",
    [
      { blockId: "b_brands", content: "Adidas" },
      {
        blockId: "b_d2",
        content: "Belle",
        loopBlockId: "b_loop",
        loopIteration: 0,
        loopItem: "2",
      },
      {
        blockId: "b_d3",
        content: "30",
        loopBlockId: "b_family",
        loopIteration: 0,
        loopItem: "1",
      },
    ],
    [{ id: "v_d3", name: "D3", value: "30" }],
  ),
];

describe("results table of questions answered inside loops", () => {
  const headerCells = parseResultHeader({
    typebot: { groups: z.array(groupV6Schema).parse(groups), variables },
    linkedTypebots: [],
    results,
  });

  it("shows one column per loop item instead of the last answer", () => {
    expect(headerCells.map((header) => header.label)).toEqual([
      "Submitted at",
      "D1",
      "D2 · Nike",
      "D2 · Adidas",
      "D2 · Puma",
      "D3 · #1",
      "D3 · #2",
    ]);
    expect(headerCells.every((header) => !header.id.includes("."))).toBe(true);
  });

  it("puts every answer in the column of its loop item", () => {
    const tableData = convertResultsToTableData({
      results,
      headerCells,
      blockIdVariableIdMap: { b_brands: "v_d1", b_d2: "v_d2", b_d3: "v_d3" },
    });
    const byLabel = (row: (typeof tableData)[number]) =>
      Object.fromEntries(
        headerCells.map((header) => [header.label, row[header.id]?.plainText]),
      );
    expect(byLabel(tableData[0]!)).toMatchObject({
      "D2 · Nike": "Comode",
      "D2 · Adidas": undefined,
      "D2 · Puma": "Care",
      "D3 · #1": "45",
      "D3 · #2": "12",
    });
    expect(byLabel(tableData[1]!)).toMatchObject({
      "D2 · Nike": undefined,
      "D2 · Adidas": "Belle",
      "D3 · #1": "30",
      "D3 · #2": undefined,
    });
  });
});
