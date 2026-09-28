import { describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { groupV6Schema } from "@typebot.io/groups/schemas";
import { variableSchema } from "@typebot.io/variables/schemas";
import { z } from "zod";
import { exportResearchDataset } from "../exportResearchDataset";
import { writeSavFile } from "./writeSavFile";

const now = new Date("2026-09-28T12:00:00.000Z");

const textBubble = (id: string, text: string) => ({
  id,
  type: "text",
  content: { richText: [{ type: "p", children: [{ text }] }] },
});

const groups = z.array(groupV6Schema).parse([
  {
    id: "g1",
    title: "Domande",
    graphCoordinates: { x: 0, y: 0 },
    blocks: [
      textBubble("t1", "Quanto sei soddisfatto?"),
      {
        id: "b_d1",
        type: "choice input",
        items: [
          { id: "i1", content: "Molto soddisfatto", value: "5" },
          { id: "i2", content: "Poco soddisfatto", value: "1" },
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
        ],
        options: { variableId: "v_d2", isMultipleChoice: true },
      },
      textBubble("t3", "Temperatura?"),
      { id: "b_temp", type: "number input", options: { variableId: "v_temp" } },
      textBubble("t4", "Perché?"),
      { id: "b_probe", type: "text input", options: { variableId: "v_probe" } },
    ],
  },
]);

const variables = z.array(variableSchema).parse([
  { id: "v_d1", name: "D1", dataType: "number", missingValues: [99] },
  { id: "v_d2", name: "D2", dataType: "number[]" },
  { id: "v_temp", name: "TEMP", dataType: "number" },
  { id: "v_probe", name: "PROBE_1", dataType: "string" },
]);

const longAnswer = `${"perché è così ".repeat(40)}FINE`;

const exportSav = () =>
  exportResearchDataset({
    questionnaireVersions: [
      { versionId: "v_1", versionNumber: 1, groups, variables },
    ],
    results: [
      {
        id: "r1",
        createdAt: new Date("2026-09-28T10:00:00.000Z"),
        hasStarted: true,
        isCompleted: true,
        completedAt: new Date("2026-09-28T10:10:00.000Z"),
        publishedVersionId: "v_1",
        publishedVersionNumber: 1,
        variables: [],
        answers: [
          { blockId: "b_d1", content: "5", value: 5 },
          { blockId: "b_d2", content: "1, 2", value: [1, 2] },
          { blockId: "b_temp", content: "-5.5", value: -5.5 },
          { blockId: "b_probe", content: longAnswer, value: longAnswer },
        ],
      },
    ],
    options: {
      fileFormat: "sav",
      multipleChoiceMode: "dichotomous",
      timeZone: "Europe/Rome",
    },
    fileLabel: "FIELDBOT test",
    now,
  });

const readInt32 = (bytes: Uint8Array, offset: number) =>
  new DataView(bytes.buffer, bytes.byteOffset).getInt32(offset, true);

describe("SPSS .sav export", () => {
  it("writes a valid system file header", () => {
    const { sav, rowCount } = exportSav();
    if (!sav) throw new Error("Expected a .sav file");
    expect(new TextDecoder().decode(sav.subarray(0, 4))).toBe("$FL2");
    expect(readInt32(sav, 64)).toBe(2); // layout code
    expect(readInt32(sav, 80)).toBe(rowCount); // number of cases
    expect(new TextDecoder().decode(sav.subarray(109, 122))).toBe(
      "FIELDBOT test",
    );
  });

  it("does not produce a .sav file for CSV exports", () => {
    const { sav } = exportResearchDataset({
      questionnaireVersions: [
        { versionId: "v_1", versionNumber: 1, groups, variables },
      ],
      results: [],
      options: {},
      now,
    });
    expect(sav).toBeUndefined();
  });

  const pyreadstatCheck = spawnSync("python3", ["-c", "import pyreadstat"]);
  const isPyreadstatAvailable = pyreadstatCheck.status === 0;

  it.skipIf(!isPyreadstatAvailable)(
    "is read back by pyreadstat with labels, value labels, missing values, datetimes and MR sets",
    () => {
      const { sav } = exportSav();
      if (!sav) throw new Error("Expected a .sav file");
      const directory = mkdtempSync(join(tmpdir(), "fieldbot-sav-"));
      const filePath = join(directory, "export.sav");
      writeFileSync(filePath, sav);
      const script = `
import json, pyreadstat
df, meta = pyreadstat.read_sav(${JSON.stringify(filePath)}, user_missing=True)
row = df.iloc[0]
print(json.dumps({
  "columns": meta.column_names,
  "labels": meta.column_names_to_labels,
  "valueLabels": {k: {str(int(a)): b for a, b in v.items()} for k, v in meta.variable_value_labels.items()},
  "missing": meta.missing_ranges,
  "measure": meta.variable_measure,
  "mrSets": meta.mr_sets,
  "fileLabel": meta.file_label,
  "D1": row["D1"], "D2_1": row["D2_1"], "D2_2": row["D2_2"], "TEMP": row["TEMP"],
  "PROBE_1": row["PROBE_1"], "STATUS": row["STATUS"],
  "START_TS": str(row["START_TS"]), "END_TS": str(row["END_TS"]),
}))
`;
      const result = spawnSync("python3", ["-c", script], {
        encoding: "utf8",
      });
      expect(result.stderr).toBe("");
      const parsed = JSON.parse(result.stdout);
      expect(parsed.columns).toContain("D2_1");
      expect(parsed.fileLabel).toBe("FIELDBOT test");
      expect(parsed.labels.D1).toBe("Quanto sei soddisfatto?");
      expect(parsed.valueLabels.D1).toEqual({
        "5": "Molto soddisfatto",
        "1": "Poco soddisfatto",
      });
      expect(parsed.missing.D1).toEqual([{ lo: 99, hi: 99 }]);
      expect(parsed.mrSets.D2).toMatchObject({
        type: "D",
        counted_value: 1,
        label: "Quali colori preferisci?",
        variable_list: ["D2_1", "D2_2"],
      });
      expect(parsed).toMatchObject({
        D1: 5,
        D2_1: 1,
        D2_2: 1,
        TEMP: -5.5,
        PROBE_1: longAnswer,
        STATUS: "COMPLETE",
        // wall-clock time in Europe/Rome
        START_TS: "2026-09-28 12:00:00",
        END_TS: "2026-09-28 12:10:00",
      });
      expect(parsed.measure.TEMP).toBe("scale");
      expect(parsed.measure.D1).toBe("nominal");
    },
  );

  it("splits very long strings without corrupting multi-byte characters", () => {
    const text = `${"àè ".repeat(200)}FINE`;
    const sav = writeSavFile({
      variables: [{ name: "OPEN", type: "string" }],
      rows: [[text]],
      now,
    });
    const recordCount = new TextDecoder()
      .decode(sav)
      .split("OPEN=1004\u0000\t").length;
    expect(recordCount).toBe(2);
  });
});
