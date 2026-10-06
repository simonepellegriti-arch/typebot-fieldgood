import { describe, expect, it } from "bun:test";
import { groupV6Schema } from "@typebot.io/groups/schemas";
import { variableSchema } from "@typebot.io/variables/schemas";
import { z } from "zod";
import type { ResearchResultInput } from "./buildResearchDataset";
import { exportResearchDataset } from "./exportResearchDataset";

const photoUrl = (resultId: string, name: string) =>
  `https://pub-test.r2.dev/public/workspaces/w/typebots/t/results/${resultId}/blocks/b_photo/${name}.jpeg`;

const groups = z.array(groupV6Schema).parse([
  {
    id: "g1",
    title: "Punto vendita",
    graphCoordinates: { x: 0, y: 0 },
    blocks: [
      {
        id: "b_photo",
        type: "photo input",
        options: {
          variableId: "v_foto",
          question: "Scatta una foto dello scaffale",
          maxPhotos: 3,
        },
      },
    ],
  },
]);

const variables = z
  .array(variableSchema)
  .parse([{ id: "v_foto", name: "FOTO" }]);

const twoPhotos = `${photoUrl("r1", "a")}, ${photoUrl("r1", "b")}`;

const results: ResearchResultInput[] = [
  {
    id: "r1",
    createdAt: new Date("2026-10-06T10:00:00.000Z"),
    hasStarted: true,
    isCompleted: true,
    completedAt: new Date("2026-10-06T10:03:00.000Z"),
    publishedVersionId: "ver1",
    publishedVersionNumber: 1,
    variables: [],
    answers: [
      {
        blockId: "b_photo",
        content: twoPhotos,
        value: twoPhotos,
        valueLabel: twoPhotos,
      },
    ],
  },
  {
    id: "r2",
    createdAt: new Date("2026-10-06T11:00:00.000Z"),
    hasStarted: true,
    isCompleted: true,
    completedAt: new Date("2026-10-06T11:02:00.000Z"),
    publishedVersionId: "ver1",
    publishedVersionNumber: 1,
    variables: [],
    answers: [
      {
        blockId: "b_photo",
        content: photoUrl("r2", "c"),
        value: photoUrl("r2", "c"),
        valueLabel: photoUrl("r2", "c"),
      },
    ],
  },
];

const exportDataset = (
  options: Parameters<typeof exportResearchDataset>[0]["options"] = {},
) =>
  exportResearchDataset({
    questionnaireVersions: [
      { versionId: "ver1", versionNumber: 1, groups, variables },
    ],
    results,
    options: { timeZone: "Europe/Rome", ...options },
    fileLabel: "Foto",
    now: new Date("2026-10-06T12:00:00.000Z"),
  });

describe("research export of photo blocks", () => {
  it("exports the photo links as a text variable labelled with the question", () => {
    const { csv, codebook } = exportDataset();
    expect(csv).toContain(`"${twoPhotos}"`);
    expect(csv).toContain(photoUrl("r2", "c"));
    expect(codebook.variables.find((v) => v.name === "FOTO")).toMatchObject({
      label: "Scatta una foto dello scaffale",
      type: "string",
    });
  });

  it("lists every photo for the ZIP, numbered when an answer holds several", () => {
    const { imageFiles } = exportDataset();
    const fileNames = imageFiles.map((file) => file.fileName);
    expect(imageFiles.map((file) => file.url)).toEqual([
      photoUrl("r1", "a"),
      photoUrl("r1", "b"),
      photoUrl("r2", "c"),
    ]);
    expect(fileNames[0]).toMatch(/_FOTO_1\.jpg$/);
    expect(fileNames[1]).toMatch(/_FOTO_2\.jpg$/);
    expect(fileNames[2]).toMatch(/_FOTO\.jpg$/);
    expect(fileNames[2]).not.toMatch(/_FOTO_\d\.jpg$/);
  });

  it("writes the SPSS .sav file", () => {
    expect(exportDataset({ fileFormat: "sav" }).sav).toBeDefined();
  });
});
