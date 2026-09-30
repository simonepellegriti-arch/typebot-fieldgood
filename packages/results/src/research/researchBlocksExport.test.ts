import { describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { VideoWatchResult } from "@typebot.io/blocks-bubbles/video/schema";
import { groupV6Schema } from "@typebot.io/groups/schemas";
import { variableSchema } from "@typebot.io/variables/schemas";
import { z } from "zod";
import type { ResearchResultInput } from "./buildResearchDataset";
import { exportResearchDataset } from "./exportResearchDataset";
import { validateResearchStructure } from "./validateResearchStructure";

const now = new Date("2026-09-30T12:00:00.000Z");

const textBubble = (id: string, text: string) => ({
  id,
  type: "text",
  content: { richText: [{ type: "p", children: [{ text }] }] },
});

const groups = z.array(groupV6Schema).parse([
  {
    id: "g1",
    title: "Questionario",
    graphCoordinates: { x: 0, y: 0 },
    blocks: [
      {
        id: "b_matrix",
        type: "matrix input",
        options: {
          variableId: "v_d10",
          question: "Quanto sei soddisfatto dei seguenti aspetti?",
          rows: [
            { id: "r1", label: "Qualità del prodotto", value: "1" },
            { id: "r2", label: "Prezzo", value: "2" },
            { id: "r3", label: "Design", value: "3" },
          ],
          columns: [
            { id: "c1", label: "Per niente", value: "1" },
            { id: "c2", label: "Poco", value: "2" },
            { id: "c3", label: "Abbastanza", value: "3" },
            { id: "c4", label: "Molto", value: "4" },
          ],
        },
      },
      textBubble("t1", "Quale marca utilizzi?"),
      {
        id: "b_d5",
        type: "choice input",
        items: [
          { id: "i1", content: "Apple", value: "1" },
          { id: "i2", content: "Samsung", value: "2" },
          {
            id: "i98",
            content: "Altro, specificare",
            value: "98",
            hasTextInput: true,
            textInputRequired: true,
          },
        ],
        options: { variableId: "v_d5" },
      },
      textBubble("t2", "Quali marche conosci?"),
      {
        id: "b_d6",
        type: "choice input",
        items: [
          { id: "k1", content: "Apple", value: "1" },
          { id: "k2", content: "Samsung", value: "2" },
          {
            id: "k98",
            content: "Altro, specificare",
            value: "98",
            hasTextInput: true,
          },
          {
            id: "k99",
            content: "Nessuna di queste",
            value: "99",
            isExclusive: true,
          },
        ],
        options: { variableId: "v_d6", isMultipleChoice: true },
      },
      textBubble("t3", "Guarda lo spot"),
      {
        id: "b_video",
        type: "video",
        content: {
          type: "url",
          url: "https://cdn.example.com/spot.mp4",
          watchTracking: {
            isEnabled: true,
            isRequired: true,
            minimumWatchPercentage: 80,
            variableId: "v_spot",
          },
        },
      },
    ],
  },
]);

const variables = z.array(variableSchema).parse([
  { id: "v_d10", name: "D10", dataType: "number" },
  { id: "v_d5", name: "D5", dataType: "number" },
  { id: "v_d6", name: "D6", dataType: "number[]" },
  { id: "v_spot", name: "SPOT" },
]);

const watchResult: VideoWatchResult = {
  isStarted: true,
  isCompleted: false,
  watchedSeconds: 24.5,
  watchedPercentage: 81.7,
  durationSeconds: 30,
  pauseCount: 2,
  events: [
    {
      type: "VIDEO_STARTED",
      positionSeconds: 0,
      at: "2026-09-30T10:00:00.000Z",
    },
  ],
};

const results: ResearchResultInput[] = [
  {
    id: "r1",
    createdAt: new Date("2026-09-30T10:00:00.000Z"),
    hasStarted: true,
    isCompleted: true,
    completedAt: new Date("2026-09-30T10:05:00.000Z"),
    publishedVersionId: "ver1",
    publishedVersionNumber: 1,
    variables: [],
    answers: [
      {
        blockId: "b_matrix",
        content:
          "Qualità del prodotto: Molto\nPrezzo: Abbastanza\nDesign: Poco",
        value: { "1": 4, "2": 3, "3": 2 },
        valueLabel: { "1": "Molto", "2": "Abbastanza", "3": "Poco" },
      },
      {
        blockId: "b_d5",
        content: "98",
        value: 98,
        valueLabel: "Altro, specificare",
        otherTexts: { "98": "Marca XYZ" },
      },
      {
        blockId: "b_d6",
        content: "1, 98",
        value: [1, 98],
        valueLabel: ["Apple", "Altro, specificare"],
        otherTexts: { "98": "Nokia" },
      },
      { blockId: "b_video", content: "81.7% (24.5s)", value: watchResult },
    ],
  },
  {
    id: "r2",
    createdAt: new Date("2026-09-30T11:00:00.000Z"),
    hasStarted: true,
    isCompleted: false,
    publishedVersionId: "ver1",
    publishedVersionNumber: 1,
    variables: [],
    answers: [
      {
        blockId: "b_matrix",
        content: "Prezzo: Poco",
        value: { "2": 2 },
      },
      { blockId: "b_d5", content: "1", value: 1, valueLabel: "Apple" },
      { blockId: "b_d6", content: "99", value: [99] },
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
    options: { timeZone: "Europe/Rome", ...options },
    fileLabel: "Research blocks",
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

describe("research export of matrix, other-specify and video blocks", () => {
  it("exports one column per matrix row, named with codes", () => {
    const { codebook } = exportDataset({ multipleChoiceMode: "dichotomous" });
    const names = codebook.variables.map((variable) => variable.name);
    expect(names).toEqual(expect.arrayContaining(["D10_1", "D10_2", "D10_3"]));
    expect(names).not.toContain("D10");
    const [first, second] = toRecords(exportDataset({}).csv);
    expect(first).toMatchObject({ D10_1: "4", D10_2: "3", D10_3: "2" });
    expect(second).toMatchObject({ D10_1: "", D10_2: "2", D10_3: "" });
    const d10Quality = codebook.variables.find((v) => v.name === "D10_1");
    expect(d10Quality).toMatchObject({
      label:
        "Quanto sei soddisfatto dei seguenti aspetti?: Qualità del prodotto",
      type: "numeric",
      measure: "ordinal",
      valueLabels: [
        { value: 1, label: "Per niente" },
        { value: 2, label: "Poco" },
        { value: 3, label: "Abbastanza" },
        { value: 4, label: "Molto" },
      ],
    });
  });

  it("exports the open text of single choice in D5_OTHER, never in D5", () => {
    const [first, second] = toRecords(exportDataset({}).csv);
    expect(first).toMatchObject({ D5: "98", D5_OTHER: "Marca XYZ" });
    expect(second).toMatchObject({ D5: "1", D5_OTHER: "" });
  });

  it("exports multiple choice open texts in D6_98_TEXT next to dichotomies", () => {
    const [first, second] = toRecords(
      exportDataset({ multipleChoiceMode: "dichotomous" }).csv,
    );
    expect(first).toMatchObject({
      D6_1: "1",
      D6_2: "0",
      D6_98: "1",
      D6_99: "0",
      D6_98_TEXT: "Nokia",
    });
    expect(second).toMatchObject({ D6_1: "0", D6_99: "1", D6_98_TEXT: "" });
  });

  it("exports video metrics from what was really watched", () => {
    const { codebook, csv } = exportDataset({});
    const [first, second] = toRecords(csv);
    expect(first).toMatchObject({
      SPOT_STARTED: "1",
      SPOT_COMPLETED: "0",
      SPOT_WATCHED_SECONDS: "24.5",
      SPOT_WATCHED_PCT: "81.7",
      SPOT_PAUSES: "2",
    });
    expect(second).toMatchObject({ SPOT_STARTED: "", SPOT_WATCHED_PCT: "" });
    expect(
      codebook.variables.find((v) => v.name === "SPOT_COMPLETED"),
    ).toMatchObject({
      measure: "nominal",
      valueLabels: [{ value: 0 }, { value: 1 }],
    });
    expect(
      codebook.variables.find((v) => v.name === "SPOT_WATCHED_PCT"),
    ).toMatchObject({ measure: "scale", type: "numeric" });
  });

  it("writes these columns in the SPSS .sav file", () => {
    const { sav, codebook } = exportDataset({
      fileFormat: "sav",
      multipleChoiceMode: "dichotomous",
    });
    expect(sav).toBeDefined();
    const pyreadstat = spawnSync("python3", ["-c", "import pyreadstat"]);
    if (pyreadstat.status !== 0 || !sav) return;
    const directory = mkdtempSync(join(tmpdir(), "fieldbot-research-"));
    const filePath = join(directory, "blocks.sav");
    writeFileSync(filePath, sav);
    const script = `
import json, pyreadstat
df, meta = pyreadstat.read_sav(${JSON.stringify(filePath)})
row = df.iloc[0]
print(json.dumps({
  "columns": meta.column_names,
  "D10_1": row["D10_1"], "D5_OTHER": row["D5_OTHER"], "D6_98_TEXT": row["D6_98_TEXT"],
  "SPOT_WATCHED_PCT": row["SPOT_WATCHED_PCT"],
  "labels": {k: {str(int(a)): b for a, b in v.items()} for k, v in meta.variable_value_labels.items()},
}))
`;
    const result = spawnSync("python3", ["-c", script], { encoding: "utf8" });
    expect(result.stderr).toBe("");
    const parsed = JSON.parse(result.stdout);
    expect(parsed.columns).toEqual(
      codebook.variables.map((variable) => variable.spssName),
    );
    expect(parsed).toMatchObject({
      D10_1: 4,
      D5_OTHER: "Marca XYZ",
      D6_98_TEXT: "Nokia",
      SPOT_WATCHED_PCT: 81.7,
    });
    expect(parsed.labels.D10_1).toEqual({
      "1": "Per niente",
      "2": "Poco",
      "3": "Abbastanza",
      "4": "Molto",
    });
  });
});

describe("research structure validation", () => {
  it("reports duplicated codes in a question", () => {
    const duplicatedGroups = z.array(groupV6Schema).parse([
      {
        id: "g",
        title: "Dup",
        graphCoordinates: { x: 0, y: 0 },
        blocks: [
          {
            id: "b",
            type: "matrix input",
            options: {
              rows: [
                { id: "r1", value: "1" },
                { id: "r2", value: "1" },
              ],
              columns: [{ id: "c1", value: "1" }],
            },
          },
        ],
      },
    ]);
    expect(
      validateResearchStructure({ groups: duplicatedGroups, variables: [] }),
    ).toEqual([
      expect.objectContaining({
        code: "duplicateCode",
        blockId: "b",
        duplicatedCode: "1",
      }),
    ]);
  });
});
