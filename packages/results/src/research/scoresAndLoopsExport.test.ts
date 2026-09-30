import { describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { groupV6Schema } from "@typebot.io/groups/schemas";
import { variableSchema } from "@typebot.io/variables/schemas";
import { z } from "zod";
import type { ResearchResultInput } from "./buildResearchDataset";
import { exportResearchDataset } from "./exportResearchDataset";

const now = new Date("2026-10-01T12:00:00.000Z");

const groups = z.array(groupV6Schema).parse([
  {
    id: "g_start",
    title: "Brand",
    graphCoordinates: { x: 0, y: 0 },
    blocks: [
      {
        id: "b_d1",
        type: "choice input",
        items: [
          { id: "i1", content: "Molto d'accordo", value: "1", score: 2 },
          { id: "i2", content: "D'accordo", value: "2", score: 1 },
          { id: "i3", content: "In disaccordo", value: "3", score: -1 },
          { id: "i99", content: "Non so", value: "99" },
        ],
        options: { variableId: "v_d1" },
      },
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
          name: "LOOP_BRAND",
          sourceType: "answers",
          sourceBlockId: "b_brands",
          bodyGroupId: "g_body",
        },
      },
    ],
  },
  {
    id: "g_body",
    title: "Per ogni marca",
    graphCoordinates: { x: 400, y: 0 },
    blocks: [
      {
        id: "b_d2",
        type: "choice input",
        items: [
          { id: "s1", content: "Pessima", value: "1", score: 0 },
          { id: "s2", content: "Buona", value: "2", score: 5 },
          { id: "s3", content: "Ottima", value: "3", score: 10 },
        ],
        options: { variableId: "v_d2" },
      },
      {
        id: "b_matrix",
        type: "matrix input",
        options: {
          variableId: "v_d10",
          rows: [
            { id: "r1", label: "Qualità", value: "1" },
            { id: "r2", label: "Prezzo", value: "2" },
          ],
          columns: [
            { id: "c1", label: "Basso", value: "1", score: -5 },
            { id: "c2", label: "Alto", value: "2", score: 5 },
          ],
        },
      },
    ],
  },
]);

const variables = z.array(variableSchema).parse([
  { id: "v_d1", name: "D1", dataType: "number" },
  { id: "v_brands", name: "BRANDS", dataType: "number[]" },
  { id: "v_d2", name: "D2", dataType: "number" },
  { id: "v_d10", name: "D10" },
]);

const loopContext = (loopIteration: number, loopItem: string) => ({
  loopBlockId: "b_loop",
  loopIteration,
  loopItem,
});

const results: ResearchResultInput[] = [
  {
    id: "res1",
    createdAt: new Date("2026-10-01T10:00:00.000Z"),
    hasStarted: true,
    isCompleted: true,
    completedAt: new Date("2026-10-01T10:05:00.000Z"),
    publishedVersionId: "ver1",
    publishedVersionNumber: 1,
    variables: [],
    answers: [
      {
        blockId: "b_d1",
        content: "3",
        value: 3,
        valueLabel: "In disaccordo",
        score: -1,
      },
      {
        blockId: "b_brands",
        content: "1, 3",
        value: [1, 3],
        valueLabel: ["Nike", "Puma"],
      },
      {
        blockId: "b_d2",
        content: "3",
        value: 3,
        valueLabel: "Ottima",
        score: 10,
        executionIndex: 1,
        ...loopContext(0, "1"),
      },
      {
        blockId: "b_matrix",
        content: "Qualità: Alto\nPrezzo: Basso",
        value: { "1": 2, "2": 1 },
        valueLabel: { "1": "Alto", "2": "Basso" },
        score: 0,
        details: { rowScores: { "1": 5, "2": -5 } },
        executionIndex: 1,
        ...loopContext(0, "1"),
      },
      {
        blockId: "b_d2",
        content: "1",
        value: 1,
        valueLabel: "Pessima",
        score: 0,
        executionIndex: 2,
        ...loopContext(1, "3"),
      },
    ],
  },
  {
    id: "res2",
    createdAt: new Date("2026-10-01T11:00:00.000Z"),
    hasStarted: true,
    isCompleted: false,
    publishedVersionId: "ver1",
    publishedVersionNumber: 1,
    variables: [],
    answers: [
      // Option without score: the score stays empty (null), never 0.
      { blockId: "b_d1", content: "99", value: 99, valueLabel: "Non so" },
      {
        blockId: "b_brands",
        content: "2",
        value: [2],
        valueLabel: ["Adidas"],
      },
      {
        blockId: "b_d2",
        content: "2",
        value: 2,
        valueLabel: "Buona",
        score: 5,
        executionIndex: 1,
        ...loopContext(0, "2"),
      },
    ],
  },
];

const exportDataset = (
  options: Parameters<typeof exportResearchDataset>[0]["options"],
) =>
  exportResearchDataset({
    questionnaireVersions: [
      { versionId: "ver1", versionNumber: 1, groups, variables },
    ],
    results,
    options: { timeZone: "Europe/Rome", valueMode: "both", ...options },
    fileLabel: "Scores and loops",
    now,
  });

const toRecords = (csv: string) => {
  const [headerLine, ...lines] = csv.trim().split(/\r?\n/);
  const headers = (headerLine ?? "").split(",");
  return lines.map((line) => {
    const cells = line.split(",");
    return Object.fromEntries(headers.map((header, i) => [header, cells[i]]));
  });
};

describe("scores in research exports", () => {
  it("exports D1 (code), D1_LABEL and D1_SCORE side by side", () => {
    const { csv, codebook } = exportDataset({});
    const [first, second] = toRecords(csv);
    expect(first).toMatchObject({
      D1: "3",
      D1_LABEL: "In disaccordo",
      D1_SCORE: "-1",
    });
    expect(second).toMatchObject({
      D1: "99",
      D1_LABEL: "Non so",
      D1_SCORE: "",
    });
    const scoreVariable = codebook.variables.find(
      (variable) => variable.name === "D1_SCORE",
    );
    expect(scoreVariable).toMatchObject({
      type: "numeric",
      measure: "scale",
      isScore: true,
    });
    expect(scoreVariable?.valueLabels ?? []).toEqual([]);
  });

  it("exports matrix row scores and the matrix total score", () => {
    const [first] = toRecords(exportDataset({}).csv);
    expect(first).toMatchObject({
      D10_NIKE_1_SCORE: "5",
      D10_NIKE_2_SCORE: "-5",
      D10_NIKE_SCORE: "0",
    });
  });

  it("omits score columns when disabled", () => {
    const { codebook } = exportDataset({ includeScores: false });
    expect(
      codebook.variables.some((variable) => variable.name.endsWith("_SCORE")),
    ).toBe(false);
  });
});

describe("loops in research exports", () => {
  it("names wide loop columns by item (D2_NIKE) with codes, not labels", () => {
    const { csv, codebook } = exportDataset({});
    const [first, second] = toRecords(csv);
    expect(first).toMatchObject({
      D2_NIKE: "3",
      D2_NIKE_SCORE: "10",
      D2_PUMA: "1",
      D2_ADIDAS: "",
    });
    expect(second).toMatchObject({ D2_ADIDAS: "2", D2_NIKE: "", D2_PUMA: "" });
    const nikeColumn = codebook.variables.find(
      (variable) => variable.name === "D2_NIKE",
    );
    expect(nikeColumn).toMatchObject({ loopBlockId: "b_loop", loopItem: "1" });
    expect(nikeColumn?.label).toContain("Nike");
  });

  it("names wide loop columns by iteration (D2_1, D2_2) on request", () => {
    const [first, second] = toRecords(
      exportDataset({ loopColumnNaming: "iteration" }).csv,
    );
    expect(first).toMatchObject({ D2_1: "3", D2_2: "1" });
    expect(second).toMatchObject({ D2_1: "2", D2_2: "" });
  });

  it("produces the long format with one row per answer and loop context", () => {
    const { longCsv } = exportDataset({ includeLongFormat: true });
    expect(longCsv).toBeDefined();
    const rows = toRecords(longCsv ?? "");
    expect(rows).toContainEqual(
      expect.objectContaining({
        RESULT_ID: "res1",
        LOOP: "LOOP_BRAND",
        ITERATION: "1",
        ITEM: "1",
        ITEM_LABEL: "Nike",
        QUESTION: "D2",
        VALUE: "3",
        LABEL: "Ottima",
        SCORE: "10",
      }),
    );
    expect(rows).toContainEqual(
      expect.objectContaining({
        RESULT_ID: "res1",
        ITEM_LABEL: "Nike",
        QUESTION: "D10_1",
        VALUE: "2",
        LABEL: "Alto",
        SCORE: "5",
      }),
    );
    expect(rows).toContainEqual(
      expect.objectContaining({
        RESULT_ID: "res1",
        LOOP: "",
        QUESTION: "D1",
        VALUE: "3",
        SCORE: "-1",
      }),
    );
    expect(rows).toContainEqual(
      expect.objectContaining({
        RESULT_ID: "res2",
        ITERATION: "1",
        ITEM_LABEL: "Adidas",
        QUESTION: "D2",
        VALUE: "2",
      }),
    );
    expect(exportDataset({}).longCsv).toBeUndefined();
  });

  it("writes loop and score columns in the SPSS .sav file", () => {
    const { sav, codebook } = exportDataset({ fileFormat: "sav" });
    expect(sav).toBeDefined();
    const pyreadstat = spawnSync("python3", ["-c", "import pyreadstat"]);
    if (pyreadstat.status !== 0 || !sav) return;
    const directory = mkdtempSync(join(tmpdir(), "fieldbot-loops-"));
    const filePath = join(directory, "loops.sav");
    writeFileSync(filePath, sav);
    const script = `
import json, pyreadstat
df, meta = pyreadstat.read_sav(${JSON.stringify(filePath)})
row = df.iloc[0]
print(json.dumps({
  "columns": meta.column_names,
  "D2_NIKE": row["D2_NIKE"], "D2_NIKE_SCORE": row["D2_NIKE_SCORE"], "D1_SCORE": row["D1_SCORE"],
}))
`;
    const result = spawnSync("python3", ["-c", script], { encoding: "utf8" });
    expect(result.stderr).toBe("");
    const parsed = JSON.parse(result.stdout);
    expect(parsed.columns).toEqual(
      codebook.variables.map((variable) => variable.spssName),
    );
    expect(parsed).toMatchObject({
      D2_NIKE: 3,
      D2_NIKE_SCORE: 10,
      D1_SCORE: -1,
    });
  });
});
