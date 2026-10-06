import { describe, expect, it, mock } from "bun:test";
import type { QuestionnaireSpec } from "../questionnaireSpecSchema";

process.env.SKIP_ENV_CHECK = "true";
process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";
mock.module("isolated-vm", () => ({
  default: {},
  Isolate: class {},
  Context: class {},
  Reference: class {},
  ExternalCopy: class {},
  Callback: class {},
}));

const { convertQuestionnaireSpecToTypebot } = await import(
  "./convertQuestionnaireSpecToTypebot"
);
const { runTestInterview } = await import(
  "@typebot.io/bot-engine/test/runTestInterview"
);
const { typebotV6Schema } = await import("@typebot.io/typebot/schemas/typebot");
const { importTypebotInputSchema } = await import(
  "@/features/typebot/api/handleImportTypebot"
);

const question = (
  overrides: Partial<QuestionnaireSpec["questions"][number]> &
    Pick<QuestionnaireSpec["questions"][number], "code" | "type" | "text">,
): QuestionnaireSpec["questions"][number] => ({
  instructions: null,
  options: [],
  rows: [],
  scale: null,
  total: null,
  maxSelections: null,
  isRandomized: false,
  showIf: null,
  terminateIf: null,
  ...overrides,
});

const option = (code: string, label: string, extra = {}) => ({
  code,
  label,
  isExclusive: false,
  isOther: false,
  ...extra,
});

const spec: QuestionnaireSpec = {
  title: "Abitudini di viaggio",
  language: "it",
  introText: "Benvenuto! Ci vorranno 3 minuti.",
  closingText: null,
  screenOutText: null,
  notes: [],
  questions: [
    question({
      code: "S1",
      type: "number",
      text: "Quanti anni hai?",
      scale: { min: 0, max: 99, minLabel: null, maxLabel: null },
      terminateIf: {
        logic: "any",
        conditions: [
          { questionCode: "S1", operator: "lessThan", values: ["18"] },
        ],
      },
    }),
    question({
      code: "D1",
      type: "single",
      text: "Hai viaggiato nell'ultimo anno?",
      instructions: "Una sola risposta",
      options: [option("1", "Sì"), option("2", "No")],
    }),
    question({
      code: "D2",
      type: "multiple",
      text: "Con quali mezzi?",
      options: [
        option("1", "Aereo"),
        option("2", "Treno"),
        option("11", "Nave"),
        option("98", "Altro", { isOther: true }),
        option("99", "Nessuno di questi", { isExclusive: true }),
      ],
      showIf: {
        logic: "all",
        conditions: [{ questionCode: "D1", operator: "anyOf", values: ["1"] }],
      },
    }),
    question({
      code: "D2b",
      type: "open",
      text: "Com'è andato il volo?",
      showIf: {
        logic: "any",
        conditions: [{ questionCode: "D2", operator: "anyOf", values: ["1"] }],
      },
    }),
    question({
      code: "D3",
      type: "matrix",
      text: "Quanto sei d'accordo?",
      options: [
        option("1", "Per niente"),
        option("2", "Poco"),
        option("3", "Molto"),
      ],
      rows: [
        { code: "1", label: "Viaggiare è rilassante" },
        { code: "2", label: "Viaggiare costa troppo" },
      ],
    }),
    question({
      code: "D4",
      type: "rating",
      text: "Quanto consiglieresti di viaggiare in treno?",
      scale: {
        min: 0,
        max: 10,
        minLabel: "Per niente",
        maxLabel: "Sicuramente",
      },
    }),
    question({ code: "D4", type: "info", text: "Ultima domanda." }),
    question({
      code: "D5",
      type: "constantSum",
      text: "Dividi 100 punti",
      rows: [
        { code: "1", label: "Prezzo" },
        { code: "2", label: "Tempo" },
      ],
      total: 100,
    }),
  ],
};

describe("convertQuestionnaireSpecToTypebot", () => {
  const { typebot, warnings } = convertQuestionnaireSpecToTypebot(spec);
  const matrixBlockId = typebot.groups
    .find((group) => group.title === "D3")
    ?.blocks.find((block) => block.type === "matrix input")?.id;
  const runnableTypebot = {
    ...typebot,
    id: "generated",
    isArchived: false,
    updatedAt: new Date(),
    workspaceId: "workspace",
  };

  it("builds a valid v6 bot with one variable per question code", () => {
    expect(warnings).toEqual([]);
    expect(() =>
      typebotV6Schema
        .pick({ groups: true, edges: true, events: true, variables: true })
        .parse(typebot),
    ).not.toThrow();
    expect(() =>
      importTypebotInputSchema.parse({
        workspaceId: "workspace",
        typebot: { ...typebot, icon: null, folderId: null },
      }),
    ).not.toThrow();
    expect(typebot.variables.map((variable) => variable.name)).toEqual([
      "S1",
      "D1",
      "D2",
      "D2b",
      "D3",
      "D4",
      "D5",
    ]);
    expect(typebot.groups.map((group) => group.title)).toContain("D4_2");
  });

  it("asks the filtered question only to those who travelled", async () => {
    const traveller = await runTestInterview(runnableTypebot, [
      "35",
      "Sì",
      "Aereo, Treno",
      "Bene",
      { type: "text", text: "1=3, 2=1" },
      "9",
      { type: "text", text: "1=60, 2=40" },
    ]);
    expect(traveller.transcript.join("\n")).toContain("Con quali mezzi?");
    expect(traveller.variables.D2).toBe("1, 2");
    expect(traveller.variables.D2b).toBe("Bene");
    expect(traveller.transcript.join("\n")).toContain(
      "Grazie per aver partecipato!",
    );

    const nonTraveller = await runTestInterview(runnableTypebot, ["35", "No"]);
    expect(nonTraveller.transcript.join("\n")).not.toContain(
      "Con quali mezzi?",
    );
    expect(nonTraveller.inputBlockIds.at(-1)).toBe(matrixBlockId);
    expect(nonTraveller.transcript.join("\n")).not.toContain(
      "Com'è andato il volo?",
    );
  });

  it("matches multiple choice codes as whole items (1 is not 11)", async () => {
    const shipTraveller = await runTestInterview(runnableTypebot, [
      "35",
      "Sì",
      "Nave",
    ]);
    expect(shipTraveller.variables.D2).toBe("11");
    expect(shipTraveller.transcript.join("\n")).not.toContain(
      "Com'è andato il volo?",
    );
    expect(shipTraveller.inputBlockIds.at(-1)).toBe(matrixBlockId);
  });

  it("ends the interview of under-18s", async () => {
    const minor = await runTestInterview(runnableTypebot, ["16"]);
    expect(minor.transcript.join("\n")).toContain("l'intervista termina qui");
    expect(minor.transcript.join("\n")).not.toContain("Hai viaggiato");
  });
});

describe("photo questions", () => {
  it("become photo blocks with the number of photos asked", () => {
    const { typebot } = convertQuestionnaireSpecToTypebot({
      ...spec,
      questions: [
        question({
          code: "F1",
          type: "photo",
          text: "Scatti una foto dello scaffale",
          maxSelections: 3,
        }),
        question({ code: "F2", type: "photo", text: "Foto dello scontrino" }),
      ],
    });
    const photoBlocks = typebot.groups
      .flatMap((group) => group.blocks)
      .filter((block) => block.type === "photo input");
    expect(photoBlocks).toHaveLength(2);
    expect(photoBlocks.map((block) => block.options)).toMatchObject([
      { question: "Scatti una foto dello scaffale", maxPhotos: 3 },
      { question: "Foto dello scontrino", maxPhotos: 1 },
    ]);
    expect(
      importTypebotInputSchema.safeParse({
        workspaceId: "w",
        typebot: { ...typebot, icon: null, folderId: null },
      }).success,
    ).toBe(true);
  });
});
