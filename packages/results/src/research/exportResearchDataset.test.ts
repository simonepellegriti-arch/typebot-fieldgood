import { describe, expect, it } from "bun:test";
import { groupV6Schema } from "@typebot.io/groups/schemas";
import { variableSchema } from "@typebot.io/variables/schemas";
import { parse } from "papaparse";
import { z } from "zod";
import type { ResearchAnswer } from "../schemas/answers";
import { buildDatasetDictionary } from "./buildDatasetDictionary";
import {
  buildResearchDataset,
  type ResearchResultInput,
} from "./buildResearchDataset";
import { exportResearchDataset } from "./exportResearchDataset";
import { parseLegacyMultipleChoiceContent } from "./normalizeResultAnswers";
import { researchExportOptionsSchema } from "./schemas";
import {
  serializeDatasetToCsv,
  toExcelSafeCell,
} from "./serializeDatasetToCsv";
import { validateResearchStructure } from "./validateResearchStructure";

const now = new Date("2026-09-28T12:00:00.000Z");

const textBubble = (id: string, text: string) => ({
  id,
  type: "text",
  content: { richText: [{ type: "p", children: [{ text }] }] },
});

const buildGroups = ({
  satisfactionQuestion = "Quanto sei soddisfatto?",
  withExtraColorOption = false,
}: {
  satisfactionQuestion?: string;
  withExtraColorOption?: boolean;
} = {}) =>
  z.array(groupV6Schema).parse([
    {
      id: "g1",
      title: "Soddisfazione",
      graphCoordinates: { x: 0, y: 0 },
      blocks: [
        textBubble("t1", satisfactionQuestion),
        {
          id: "b_d1",
          type: "choice input",
          items: [
            { id: "i1", content: "Molto soddisfatto", value: "5" },
            { id: "i2", content: "Abbastanza soddisfatto", value: "4" },
            { id: "i3", content: "Per niente soddisfatto", value: "1" },
          ],
          options: { variableId: "v_d1" },
        },
        textBubble("t2", "Quali colori preferisci?"),
        {
          id: "b_d2",
          type: "choice input",
          items: [
            { id: "c1", content: "Rosso, scuro", value: "1" },
            { id: "c2", content: "Blu", value: "2" },
            { id: "c3", content: "Verde", value: "3" },
            ...(withExtraColorOption
              ? [{ id: "c4", content: "Giallo", value: "4" }]
              : []),
          ],
          options: { variableId: "v_d2", isMultipleChoice: true },
        },
        textBubble("t3", "Qual è la temperatura minima?"),
        {
          id: "b_temp",
          type: "number input",
          options: { variableId: "v_temp" },
        },
        textBubble("t4", "Il tuo telefono"),
        {
          id: "b_phone",
          type: "phone number input",
          options: { variableId: "v_phone" },
        },
        textBubble("t5", "Perché?"),
        {
          id: "b_probe",
          type: "text input",
          options: { variableId: "v_probe" },
        },
      ],
    },
  ]);

const variables = z.array(variableSchema).parse([
  { id: "v_d1", name: "D1", dataType: "number" },
  { id: "v_d2", name: "D2", dataType: "number[]" },
  { id: "v_temp", name: "TEMP", dataType: "number" },
  { id: "v_phone", name: "PHONE", dataType: "string" },
  { id: "v_probe", name: "PROBE_1", dataType: "string" },
  { id: "v_panel", name: "PANEL_ID" },
]);

const versionOne = {
  versionId: "v_abc1",
  versionNumber: 1,
  groups: buildGroups(),
  variables,
};

const answer = (
  blockId: string,
  content: string,
  extra: Partial<ResearchAnswer> = {},
  minute = 1,
): ResearchAnswer => ({
  blockId,
  content,
  createdAt: new Date(
    `2026-09-28T10:${String(minute).padStart(2, "0")}:00.000Z`,
  ),
  ...extra,
});

const baseResult = (
  overrides: Partial<ResearchResultInput> = {},
): ResearchResultInput => ({
  id: "r1",
  createdAt: new Date("2026-09-28T10:00:00.000Z"),
  hasStarted: true,
  isCompleted: true,
  completedAt: new Date("2026-09-28T10:10:00.000Z"),
  publishedVersionId: "v_abc1",
  publishedVersionNumber: 1,
  variables: [{ id: "v_panel", name: "PANEL_ID", value: "P-001" }],
  answers: [],
  ...overrides,
});

const exportRows = (
  results: ResearchResultInput[],
  options: Parameters<typeof researchExportOptionsSchema.parse>[0] = {},
  versions = [versionOne],
) => {
  const dataset = buildResearchDataset({
    dictionary: buildDatasetDictionary(versions),
    results,
    options: researchExportOptionsSchema.parse(options),
    now,
  });
  const names = dataset.columns.map((column) => column.name);
  return {
    dataset,
    names,
    rows: dataset.rows.map((row) =>
      Object.fromEntries(row.map((cell, index) => [names[index], cell])),
    ),
  };
};

describe("research export", () => {
  it("exports single choice value, label or both", () => {
    const result = baseResult({
      answers: [
        answer("b_d1", "5", { value: "5", valueLabel: "Molto soddisfatto" }),
      ],
    });
    expect(exportRows([result]).rows[0]!.D1).toBe(5);
    expect(exportRows([result], { valueMode: "label" }).rows[0]!.D1).toBe(
      "Molto soddisfatto",
    );
    const both = exportRows([result], { valueMode: "both" }).rows[0]!;
    expect(both.D1).toBe(5);
    expect(both.D1_LABEL).toBe("Molto soddisfatto");
  });

  it("exports multiple choice arrays in compact and dichotomous modes", () => {
    const result = baseResult({
      answers: [
        answer("b_d2", "1, 3", {
          value: [1, 3],
          valueLabel: ["Rosso, scuro", "Verde"],
        }),
      ],
    });
    expect(exportRows([result]).rows[0]!.D2).toBe("1|3");
    expect(
      exportRows([result], { multipleChoiceSeparator: ";" }).rows[0]!.D2,
    ).toBe("1;3");
    const dichotomous = exportRows([result], {
      multipleChoiceMode: "dichotomous",
    });
    expect(dichotomous.names).toContain("D2_1");
    expect(dichotomous.rows[0]).toMatchObject({ D2_1: 1, D2_2: 0, D2_3: 1 });
    expect(dichotomous.names).not.toContain("D2");
  });

  it("keeps labels containing commas unambiguous", () => {
    const result = baseResult({
      answers: [
        answer("b_d2", "1, 2", {
          value: [1, 2],
          valueLabel: ["Rosso, scuro", "Blu"],
        }),
      ],
    });
    const { rows } = exportRows([result], { valueMode: "label" });
    expect(rows[0]!.D2).toBe("Rosso, scuro|Blu");
    expect(
      parseLegacyMultipleChoiceContent("Rosso, scuro, Verde", [
        { value: 1, label: "Rosso, scuro" },
        { value: 2, label: "Blu" },
        { value: 3, label: "Verde" },
      ]).map((option) => option.value),
    ).toEqual([1, 3]);
  });

  it("exposes interview status and filters complete / incomplete interviews", () => {
    const complete = baseResult({
      id: "complete",
      answers: [answer("b_d1", "5")],
    });
    const started = baseResult({
      id: "started",
      isCompleted: false,
      completedAt: null,
      answers: [answer("b_d1", "4", {}, 58)],
      createdAt: new Date("2026-09-28T11:50:00.000Z"),
    });
    const abandoned = baseResult({
      id: "abandoned",
      isCompleted: false,
      completedAt: null,
      createdAt: new Date("2026-09-20T10:00:00.000Z"),
      answers: [
        {
          ...answer("b_d1", "1"),
          createdAt: new Date("2026-09-20T10:01:00.000Z"),
        },
      ],
    });
    const notStarted = baseResult({
      id: "notStarted",
      hasStarted: false,
      isCompleted: false,
      completedAt: null,
      answers: [],
    });
    const results = [complete, started, abandoned, notStarted];

    const all = exportRows(results, { includeNotStarted: true }).rows;
    expect(all.map((row) => [row.RESULT_ID, row.STATUS])).toEqual([
      ["complete", "COMPLETE"],
      ["started", "STARTED"],
      ["abandoned", "ABANDONED"],
      ["notStarted", "NOT_STARTED"],
    ]);
    expect(all[0]).toMatchObject({ IS_STARTED: 1, IS_COMPLETED: 1 });
    expect(all[1]).toMatchObject({ IS_STARTED: 1, IS_COMPLETED: 0 });

    expect(
      exportRows(results, { statusFilter: "complete" }).rows.map(
        (row) => row.RESULT_ID,
      ),
    ).toEqual(["complete"]);
    expect(
      exportRows(results, { statusFilter: "incomplete" }).rows.map(
        (row) => row.RESULT_ID,
      ),
    ).toEqual(["started", "abandoned"]);
  });

  it("computes START_TS, END_TS and DURATION_SECONDS in ISO 8601", () => {
    const complete = baseResult({ answers: [answer("b_d1", "5", {}, 9)] });
    const incomplete = baseResult({
      id: "r2",
      isCompleted: false,
      completedAt: null,
      answers: [answer("b_d1", "5", {}, 3)],
    });
    const { rows } = exportRows([complete, incomplete]);
    expect(rows[0]).toMatchObject({
      START_TS: "2026-09-28T10:00:00.000Z",
      END_TS: "2026-09-28T10:10:00.000Z",
      DURATION_SECONDS: 600,
    });
    expect(rows[1]).toMatchObject({
      START_TS: "2026-09-28T10:00:00.000Z",
      END_TS: null,
      LAST_ACTIVITY_TS: "2026-09-28T10:03:00.000Z",
      DURATION_SECONDS: 180,
    });
    const romeRows = exportRows([complete], { timeZone: "Europe/Rome" }).rows;
    expect(romeRows[0]!.START_TS).toBe("2026-09-28T12:00:00.000+02:00");
  });

  it("keeps -5 numeric and never alters it in the CSV", () => {
    const result = baseResult({
      answers: [answer("b_temp", "-5", { value: -5 })],
    });
    const { dataset, rows } = exportRows([result]);
    expect(rows[0]!.TEMP).toBe(-5);
    for (const mode of ["excelSafe", "raw"] as const) {
      const parsedCsv = parse<string[]>(
        serializeDatasetToCsv(dataset, { mode }).replace(/^﻿/, ""),
      ).data;
      const tempIndex = parsedCsv[0]!.indexOf("TEMP");
      expect(parsedCsv[1]![tempIndex]).toBe("-5");
    }
  });

  it("keeps +39 phone numbers intact while still neutralizing formulas", () => {
    const result = baseResult({
      answers: [
        answer("b_phone", "+393401234567", { value: "+393401234567" }),
        answer("b_probe", '=HYPERLINK("http://x")', {
          value: '=HYPERLINK("http://x")',
        }),
      ],
    });
    const { dataset, rows } = exportRows([result]);
    expect(rows[0]!.PHONE).toBe("+393401234567");
    const safeCsv = parse<string[]>(
      serializeDatasetToCsv(dataset, { mode: "excelSafe" }).replace(/^﻿/, ""),
    ).data;
    const rawCsv = parse<string[]>(
      serializeDatasetToCsv(dataset, { mode: "raw" }),
    ).data;
    const phoneIndex = safeCsv[0]!.indexOf("PHONE");
    const probeIndex = safeCsv[0]!.indexOf("PROBE_1");
    expect(safeCsv[1]![phoneIndex]).toBe("+393401234567");
    expect(safeCsv[1]![probeIndex]).toBe('\'=HYPERLINK("http://x")');
    expect(rawCsv[1]![probeIndex]).toBe('=HYPERLINK("http://x")');
    expect(toExcelSafeCell("-5")).toBe("-5");
    expect(toExcelSafeCell("-abc")).toBe("'-abc");
  });

  it("never loses answers when the same block runs twice (probing loops)", () => {
    const result = baseResult({
      answers: [
        answer("b_probe", "prima risposta", { executionIndex: 1 }, 1),
        answer("b_probe", "seconda risposta", { executionIndex: 2 }, 2),
      ],
    });
    const columns = exportRows([result]);
    expect(columns.rows[0]).toMatchObject({
      PROBE_1_1: "prima risposta",
      PROBE_1_2: "seconda risposta",
    });
    expect(
      exportRows([result], { repeatedAnswersMode: "json" }).rows[0]!.PROBE_1,
    ).toBe(JSON.stringify(["prima risposta", "seconda risposta"]));
    expect(
      exportRows([result], { repeatedAnswersMode: "last" }).rows[0]!.PROBE_1,
    ).toBe("seconda risposta");
  });

  it("keeps the column name when the question label is renamed", () => {
    const renamedVersion = {
      versionId: "v_abc2",
      versionNumber: 2,
      groups: buildGroups({
        satisfactionQuestion: "Quanto sei soddisfatto del servizio?",
      }),
      variables,
    };
    const before = buildDatasetDictionary([versionOne]);
    const after = buildDatasetDictionary([versionOne, renamedVersion]);
    const d1Before = before.questions.find((q) => q.blockId === "b_d1")!;
    const d1After = after.questions.find((q) => q.blockId === "b_d1")!;
    expect(d1Before.label).toBe("Quanto sei soddisfatto?");
    expect(d1After.label).toBe("Quanto sei soddisfatto del servizio?");
    expect(d1Before.variableName).toBe("D1");
    expect(d1After.variableName).toBe("D1");
    expect(d1After.id).toBe(d1Before.id);
  });

  it("exports several versions of the same typebot and filters by version", () => {
    const versionTwo = {
      versionId: "v_abc2",
      versionNumber: 2,
      groups: buildGroups({ withExtraColorOption: true }),
      variables,
    };
    const resultV1 = baseResult({
      id: "r_v1",
      answers: [answer("b_d2", "1", { value: [1] })],
    });
    const resultV2 = baseResult({
      id: "r_v2",
      publishedVersionId: "v_abc2",
      publishedVersionNumber: 2,
      answers: [answer("b_d2", "4", { value: [4] })],
    });
    const legacyResult = baseResult({
      id: "r_legacy",
      publishedVersionId: null,
      publishedVersionNumber: null,
      answers: [answer("b_d2", "2")],
    });
    const results = [resultV1, resultV2, legacyResult];

    const all = exportRows(results, { multipleChoiceMode: "dichotomous" }, [
      versionOne,
      versionTwo,
    ]);
    expect(all.names).toContain("D2_4");
    expect(
      all.rows.map((row) => [
        row.RESULT_ID,
        row.TYPEBOT_VERSION,
        row.TYPEBOT_VERSION_ID,
      ]),
    ).toEqual([
      ["r_v1", 1, "v_abc1"],
      ["r_v2", 2, "v_abc2"],
      ["r_legacy", null, null],
    ]);
    expect(all.rows[1]).toMatchObject({ D2_1: 0, D2_4: 1 });

    const onlyV2 = exportRows(results, { versionNumbers: [2] }, [
      versionOne,
      versionTwo,
    ]);
    expect(onlyV2.rows.map((row) => row.RESULT_ID)).toEqual(["r_v2"]);
    const v1AndLegacy = exportRows(
      results,
      { versionNumbers: [1], includePreVersioningResults: true },
      [versionOne, versionTwo],
    );
    expect(v1AndLegacy.rows.map((row) => row.RESULT_ID)).toEqual([
      "r_v1",
      "r_legacy",
    ]);
  });

  it("reads legacy results saved as plain strings", () => {
    const legacyResult = baseResult({
      completedAt: null,
      publishedVersionId: null,
      publishedVersionNumber: null,
      answers: [
        // legacy: no value, no executionIndex, multiple choice joined with ", "
        answer("b_d1", "Molto soddisfatto", {}, 1),
        answer("b_d2", "Rosso, scuro, Verde", {}, 2),
        answer("b_temp", "-5", {}, 3),
        answer("b_probe", "prima", {}, 4),
        answer("b_probe", "seconda", {}, 5),
      ],
    });
    const { rows } = exportRows([legacyResult], { valueMode: "both" });
    expect(rows[0]).toMatchObject({
      D1: 5,
      D1_LABEL: "Molto soddisfatto",
      D2: "1|3",
      D2_LABEL: "Rosso, scuro|Verde",
      TEMP: -5,
      PROBE_1_1: "prima",
      PROBE_1_2: "seconda",
      // completed before completedAt existed: END_TS = last answer
      END_TS: "2026-09-28T10:05:00.000Z",
      TYPEBOT_VERSION: null,
    });
  });

  it("exports hidden variables and produces an SPSS-ready codebook", () => {
    const result = baseResult({
      answers: [answer("b_d1", "5", { value: 5 })],
    });
    const { csv, codebook, rowCount } = exportResearchDataset({
      questionnaireVersions: [
        { ...versionOne, publishedAt: new Date("2026-09-01T00:00:00Z") },
      ],
      results: [result],
      options: { multipleChoiceMode: "dichotomous" },
      now,
    });
    expect(rowCount).toBe(1);
    expect(csv.startsWith("﻿RESULT_ID,STATUS")).toBe(true);
    const d1 = codebook.variables.find((variable) => variable.name === "D1")!;
    expect(d1).toMatchObject({
      type: "numeric",
      label: "Quanto sei soddisfatto?",
      valueLabels: [
        { value: 5, label: "Molto soddisfatto" },
        { value: 4, label: "Abbastanza soddisfatto" },
        { value: 1, label: "Per niente soddisfatto" },
      ],
    });
    expect(codebook.multipleResponseSets).toEqual([
      {
        name: "$D2",
        label: "Quali colori preferisci?",
        type: "dichotomies",
        countedValue: 1,
        variables: ["D2_1", "D2_2", "D2_3"],
      },
    ]);
    expect(
      codebook.variables.find((variable) => variable.name === "PANEL_ID"),
    ).toMatchObject({ type: "string" });
    expect(codebook.questionnaireVersions).toEqual([
      {
        versionNumber: 1,
        versionId: "v_abc1",
        publishedAt: "2026-09-01T00:00:00.000Z",
      },
    ]);
  });

  it("reports duplicated variable names before publishing", () => {
    const warnings = validateResearchStructure({
      groups: buildGroups(),
      variables: [...variables, { id: "v_dup", name: "D1" }],
    });
    expect(warnings.map((warning) => warning.code)).toContain(
      "duplicateVariableName",
    );
  });
});
