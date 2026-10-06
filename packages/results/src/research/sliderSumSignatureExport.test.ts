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
import { validateResearchStructure } from "./validateResearchStructure";

const now = new Date("2026-10-01T12:00:00.000Z");
const signatureUrl =
  "https://pub-test.r2.dev/public/workspaces/w/typebots/t/results/r1/blocks/b_sign/abc.jpg";

const groups = z.array(groupV6Schema).parse([
  {
    id: "g1",
    title: "Questionario",
    graphCoordinates: { x: 0, y: 0 },
    blocks: [
      {
        id: "b_slider",
        type: "slider input",
        options: {
          variableId: "v_d1",
          question: "Quanto ti piace il nuovo pack?",
          minLabel: "Per niente",
          maxLabel: "Moltissimo",
          unit: "%",
        },
      },
      {
        id: "b_sliders",
        type: "slider input",
        options: {
          variableId: "v_d2",
          question: "Quanto sei d'accordo?",
          rows: [
            { id: "s1", label: "È moderno", value: "1" },
            { id: "s2", label: "È costoso", value: "2" },
          ],
        },
      },
      {
        id: "b_sum",
        type: "constant sum input",
        options: {
          variableId: "v_d3",
          question: "Distribuisci 100 punti in base all'importanza",
          items: [
            { id: "k1", label: "Prezzo", value: "1" },
            { id: "k2", label: "Qualità", value: "2" },
            { id: "k3", label: "Marca", value: "3" },
          ],
        },
      },
      {
        id: "b_sign",
        type: "signature input",
        options: { variableId: "v_sign", question: "Firma per il consenso" },
      },
    ],
  },
]);

const variables = z.array(variableSchema).parse([
  { id: "v_d1", name: "D1" },
  { id: "v_d2", name: "D2" },
  { id: "v_d3", name: "D3" },
  { id: "v_sign", name: "FIRMA" },
]);

const results: ResearchResultInput[] = [
  {
    id: "r1",
    createdAt: new Date("2026-10-01T10:00:00.000Z"),
    hasStarted: true,
    isCompleted: true,
    completedAt: new Date("2026-10-01T10:05:00.000Z"),
    publishedVersionId: "ver1",
    publishedVersionNumber: 1,
    variables: [],
    answers: [
      { blockId: "b_slider", content: "-35%", value: -35, valueLabel: "-35%" },
      {
        blockId: "b_sliders",
        content: "È moderno: 80\nÈ costoso: -100",
        value: { "1": 80, "2": -100 },
        valueLabel: { "1": "80", "2": "-100" },
      },
      {
        blockId: "b_sum",
        content: "Prezzo: 50\nQualità: 30\nMarca: 20\nTotal: 100",
        value: { "1": 50, "2": 30, "3": 20 },
        valueLabel: { "1": "50", "2": "30", "3": "20" },
      },
      {
        blockId: "b_sign",
        content: signatureUrl,
        value: signatureUrl,
        valueLabel: signatureUrl,
      },
    ],
  },
  {
    id: "r2",
    createdAt: new Date("2026-10-01T11:00:00.000Z"),
    hasStarted: true,
    isCompleted: false,
    publishedVersionId: "ver1",
    publishedVersionNumber: 1,
    variables: [],
    answers: [
      { blockId: "b_slider", content: "100%", value: 100, valueLabel: "100%" },
      {
        blockId: "b_sum",
        content: "Prezzo: 100\nQualità: 0\nMarca: 0\nTotal: 100",
        value: { "1": 100, "2": 0, "3": 0 },
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
    options: { timeZone: "Europe/Rome", ...options },
    fileLabel: "Slider sum signature",
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

describe("research export of slider, constant sum and signature blocks", () => {
  it("exports a single slider as one number from -100 to +100", () => {
    const { csv, codebook } = exportDataset({ valueMode: "both" });
    const [first, second] = toRecords(csv);
    expect(first).toMatchObject({ D1: "-35" });
    expect(second).toMatchObject({ D1: "100" });
    const names = codebook.variables.map((variable) => variable.name);
    expect(names).not.toContain("D1_LABEL");
    expect(codebook.variables.find((v) => v.name === "D1")).toMatchObject({
      label: "Quanto ti piace il nuovo pack?",
      type: "numeric",
      measure: "scale",
      valueLabels: [
        { value: -100, label: "Per niente" },
        { value: 100, label: "Moltissimo" },
      ],
    });
  });

  it("exports one column per slider statement", () => {
    const [first, second] = toRecords(exportDataset({}).csv);
    expect(first).toMatchObject({ D2_1: "80", D2_2: "-100" });
    expect(second).toMatchObject({ D2_1: "", D2_2: "" });
  });

  it("exports one column per constant sum category and the total", () => {
    const { csv, codebook } = exportDataset({ valueMode: "label" });
    const [first, second] = toRecords(csv);
    expect(first).toMatchObject({
      D3_1: "50",
      D3_2: "30",
      D3_3: "20",
      D3_TOT: "100",
    });
    expect(second).toMatchObject({
      D3_1: "100",
      D3_2: "0",
      D3_3: "0",
      D3_TOT: "100",
    });
    expect(codebook.variables.find((v) => v.name === "D3_2")).toMatchObject({
      label: "Distribuisci 100 punti in base all'importanza: Qualità",
      type: "numeric",
      measure: "scale",
    });
    expect(codebook.variables.find((v) => v.name === "D3_TOT")).toMatchObject({
      type: "numeric",
      measure: "scale",
    });
  });

  it("exports the link of the signature JPEG", () => {
    const [first, second] = toRecords(exportDataset({}).csv);
    expect(first).toMatchObject({ FIRMA: signatureUrl });
    expect(second).toMatchObject({ FIRMA: "" });
  });

  it("lists the signature JPEGs to download, named after the dataset row and column", () => {
    const { imageFiles, csv } = exportDataset({});
    const [first] = toRecords(csv);
    expect(imageFiles).toEqual([
      { fileName: `${first?.RESULT_ID}_FIRMA.jpg`, url: signatureUrl },
    ]);
  });

  it("writes these columns in the SPSS .sav file", () => {
    const { sav } = exportDataset({ fileFormat: "sav" });
    expect(sav).toBeDefined();
    const pyreadstat = spawnSync("python3", ["-c", "import pyreadstat"]);
    if (pyreadstat.status !== 0 || !sav) return;
    const directory = mkdtempSync(join(tmpdir(), "fieldbot-sum-"));
    const filePath = join(directory, "sum.sav");
    writeFileSync(filePath, sav);
    const script = `
import json, pyreadstat
df, meta = pyreadstat.read_sav(${JSON.stringify(filePath)})
row = df.iloc[0]
print(json.dumps({
  "D1": row["D1"], "D2_2": row["D2_2"], "D3_1": row["D3_1"], "D3_TOT": row["D3_TOT"],
  "FIRMA": row["FIRMA"],
  "measure": {k: meta.variable_measure[k] for k in ["D1", "D3_1", "D3_TOT"]},
}))
`;
    const result = spawnSync("python3", ["-c", script], { encoding: "utf8" });
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toMatchObject({
      D1: -35,
      D2_2: -100,
      D3_1: 50,
      D3_TOT: 100,
      FIRMA: signatureUrl,
      measure: { D1: "scale", D3_1: "scale", D3_TOT: "scale" },
    });
  });

  it("reports duplicated category codes", () => {
    const duplicatedGroups = z.array(groupV6Schema).parse([
      {
        id: "g",
        title: "Dup",
        graphCoordinates: { x: 0, y: 0 },
        blocks: [
          {
            id: "b",
            type: "constant sum input",
            options: {
              items: [
                { id: "k1", value: "1" },
                { id: "k2", value: "1" },
              ],
            },
          },
        ],
      },
    ]);
    const warnings = validateResearchStructure({
      groups: duplicatedGroups,
      variables: [],
    });
    expect(
      warnings.some((warning) => warning.message.includes("categories")),
    ).toBe(true);
  });
});
