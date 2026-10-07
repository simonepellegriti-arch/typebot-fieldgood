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

// Set variable code runs in isolated-vm in production; here in plain JS, with
// the same rules (variables passed by id, numbers guessed from strings).
const { parseGuessedValueType } = await import(
  "@typebot.io/variables/parseGuessedValueType"
);
mock.module("@typebot.io/variables/executeFunction", () => ({
  executeFunction: async ({
    variables,
    body,
  }: {
    variables: { id: string; name: string; value?: unknown }[];
    body: string;
  }) => {
    const usedVariables = variables.filter((variable) =>
      body.includes(`{{${variable.name}}}`),
    );
    const code = usedVariables.reduce(
      (text, variable) => text.replaceAll(`{{${variable.name}}}`, variable.id),
      body,
    );
    try {
      const run = new Function(
        ...usedVariables.map((variable) => variable.id),
        `return (async () => { ${code} })()`,
      );
      return {
        output: await run(
          ...usedVariables.map((variable) =>
            parseGuessedValueType(
              typeof variable.value === "string" || variable.value == null
                ? (variable.value ?? undefined)
                : String(variable.value),
            ),
          ),
        ),
        newVariables: [],
      };
    } catch (error) {
      return { error, output: undefined };
    }
  },
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
  media: null,
  probe: null,
  stimulus: null,
  photo: null,
  showIf: null,
  terminateIf: null,
  ...overrides,
});

const option = (
  code: string,
  label: string,
  extra: { isExclusive?: boolean; isOther?: boolean; goTo?: string } = {},
) => ({
  code,
  label,
  isExclusive: false,
  isOther: false,
  goTo: null,
  ...extra,
});

const spec: QuestionnaireSpec = {
  title: "Abitudini di viaggio",
  language: "it",
  addressForm: "tu",
  privacyUrl: null,
  voiceTest: false,
  linkVariables: [],
  computedVariables: [],
  airtable: null,
  introText: "Benvenuto! Ci vorranno 3 minuti.",
  closingText: null,
  screenOutText: null,
  notes: [],
  loops: [],
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

describe("photo of the products with an AI check or a description", () => {
  const { typebot, warnings } = convertQuestionnaireSpecToTypebot(
    {
      ...spec,
      questions: [
        question({
          code: "B1",
          type: "photo",
          text: "Carica una foto dei prodotti che usi per la digestione.",
          photo: {
            check: "confezioni di farmaci o prodotti per la digestione",
            allowDescription: true,
            describePrompt: "Scrivimi o dimmi a voce quali prodotti usi.",
          },
        }),
        question({ code: "B2", type: "open", text: "Da quanto li usi?" }),
      ],
    },
    { openAiCredentialsId: "cred_openai" },
  );
  const blocks = typebot.groups.flatMap((group) => group.blocks);

  it("asks photo or description, checks the photo and lets it be replaced", () => {
    expect(warnings).toEqual([]);
    expect(() =>
      typebotV6Schema
        .pick({ groups: true, edges: true, events: true, variables: true })
        .parse(typebot),
    ).not.toThrow();
    expect(typebot.groups.map((group) => group.title)).toEqual(
      expect.arrayContaining([
        "B1",
        "B1 DESCRIZIONE",
        "B1 FOTO NON RICONOSCIUTA",
      ]),
    );
    const photoBlock = blocks.find((block) => block.type === "photo input");
    expect(photoBlock?.options).toMatchObject({ source: "cameraOrGallery" });
    const check = blocks.find(
      (block) =>
        block.type === "openai" &&
        block.options?.action === "Create chat completion",
    );
    expect(JSON.stringify(check?.options)).toContain(
      "confezioni di farmaci o prodotti per la digestione",
    );
    expect(typebot.variables.map((variable) => variable.name)).toEqual(
      expect.arrayContaining([
        "B1_MODO",
        "B1",
        "B1_FOTO_OK",
        "B1_PRODOTTI_FOTO",
        "B1_DESCRIZIONE",
        "B1_DESCRIZIONE_TRASCRIZIONE",
      ]),
    );
  });

  it("goes on to the next question after the description", async () => {
    const interview = await runTestInterview(
      {
        ...typebot,
        id: "photo",
        isArchived: false,
        updatedAt: new Date(),
        workspaceId: "w",
      },
      ["✍️ Preferisco descriverli", "Uso Maalox Plus e Gaviscon"],
    );
    expect(interview.variables.B1_MODO).toBe("Descrizione");
    expect(interview.variables.B1_DESCRIZIONE).toBe(
      "Uso Maalox Plus e Gaviscon",
    );
    expect(interview.transcript.join("\n")).toContain("Da quanto li usi?");
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

type TestBlock = Record<string, unknown> & { id: string; type: string };
type TestGroup = { title: string; blocks: TestBlock[] };

/**
 * Airtable calls and OpenAI blocks can't run in tests: they become Set
 * variable blocks (same id and edges) that write the given values.
 */
const withMockedServices = (
  typebot: ReturnType<typeof convertQuestionnaireSpecToTypebot>["typebot"],
  {
    initialValues = {},
    generated = () => "🏁",
    transcribed = "risposta trascritta",
  }: {
    initialValues?: Record<string, string>;
    generated?: (variableName: string) => string;
    transcribed?: string;
  },
) => {
  const nameOf = (variableId: unknown) =>
    typebot.variables.find((variable) => variable.id === variableId)?.name ??
    "";
  const noopId = "v_noop";
  const groups: TestGroup[] = typebot.groups.map((group) => ({
    ...group,
    blocks: group.blocks.map((block) => {
      const options = (block.options ?? {}) as Record<string, unknown>;
      const asSetVariable = (variableId: unknown, value: string) => ({
        id: block.id,
        type: "Set variable",
        outgoingEdgeId: block.outgoingEdgeId,
        options: {
          variableId,
          expressionToEvaluate: JSON.stringify(value),
        },
      });
      if (block.type === "Webhook") return asSetVariable(noopId, "1");
      if (block.type === "openai" && options.action === "Create transcription")
        return asSetVariable(options.transcriptionVariableId, transcribed);
      if (block.type === "openai") {
        const [extracted] = (options.variablesToExtract ?? []) as {
          variableId: string;
        }[];
        return asSetVariable(
          extracted?.variableId,
          generated(nameOf(extracted?.variableId)),
        );
      }
      return block;
    }),
  }));
  return {
    ...typebot,
    groups,
    variables: [
      ...typebot.variables.map((variable) =>
        variable.name in initialValues
          ? { ...variable, value: initialValues[variable.name] }
          : variable,
      ),
      { id: noopId, name: "noop" },
    ],
    id: "generated",
    isArchived: false,
    updatedAt: new Date(),
    workspaceId: "workspace",
  };
};

const shopperSpec: QuestionnaireSpec = {
  ...spec,
  title: "Espositore refrigerato",
  linkVariables: [{ name: "panel", description: "TEST o CONTROL" }],
  computedVariables: [
    {
      name: "formato",
      sourceVariable: "panel",
      cases: [{ whenValue: "TEST", text: "lattina 330ml" }],
      defaultText: "bottiglietta 400ml",
    },
  ],
  introText: null,
  questions: [
    question({
      code: "Q8",
      type: "single",
      text: "Quanto sei propenso ad acquistare Estathé {{formato}}?",
      options: [
        option("1", "Certamente acquisterei"),
        option("2", "Probabilmente acquisterei"),
      ],
    }),
    question({
      code: "Q9",
      type: "open",
      text: "Puoi dirmi perché hai risposto «{{Q8}}»?",
      media: "voice",
      probe: { elements: ["motivazioni"], maxFollowUps: 2 },
    }),
    question({
      code: "Q33",
      type: "single",
      text: "Come hai trovato la lattina rispetto alla bottiglietta?",
      options: [option("1", "Meglio"), option("2", "Peggio")],
      showIf: {
        logic: "all",
        conditions: [
          { questionCode: "panel", operator: "anyOf", values: ["TEST"] },
        ],
      },
    }),
    question({
      code: "Q25",
      type: "matrix",
      text: "Rispondi sì o no a ciascuna affermazione.",
      options: [option("1", "Sì"), option("2", "No")],
      rows: [
        { code: "1", label: "È ideale quando voglio una bevanda fresca" },
        { code: "2", label: "È pratica da portare con me" },
      ],
    }),
  ],
};

describe("FieldGood patterns", () => {
  const { typebot, warnings } = convertQuestionnaireSpecToTypebot(shopperSpec, {
    openAiCredentialsId: "cred_openai",
  });

  it("builds a valid bot with voice answers, follow-ups and piped labels", () => {
    expect(warnings).toEqual([]);
    expect(
      importTypebotInputSchema.safeParse({
        workspaceId: "w",
        typebot: { ...typebot, icon: null, folderId: null },
      }).success,
    ).toBe(true);
    const q9 = typebot.groups.find((group) => group.title === "Q9");
    const types = q9?.blocks.map((block) => block.type) ?? [];
    expect(types.filter((type) => type === "openai")).toHaveLength(5);
    const q9Input = q9?.blocks.find((block) => block.type === "text input");
    expect(q9Input?.options).toMatchObject({ audioClip: { isEnabled: true } });
  });

  it("pipes labels, computes texts from link variables and filters on them", async () => {
    const testPanel = await runTestInterview(
      withMockedServices(typebot, {
        initialValues: { panel: "TEST" },
        generated: (name) =>
          name === "Q9_AI1" ? "Cosa ti spinge di più? 😊" : "🏁",
      }),
      [
        "Probabilmente acquisterei",
        { type: "audio", url: "https://example.com/vocale.webm" },
        "Il prezzo",
        "Meglio",
        { type: "text", text: "1=1, 2=2" },
      ],
    );
    const transcript = testPanel.transcript.join("\n");
    expect(transcript).toContain("Estathé lattina 330ml");
    expect(transcript).toContain("«Probabilmente acquisterei»");
    expect(transcript).toContain("Cosa ti spinge di più? 😊");
    expect(transcript).toContain("Come hai trovato la lattina");
    expect(testPanel.variables.Q8).toBe("2");
    expect(testPanel.variables.Q9).toBe("risposta trascritta");
    expect(testPanel.variables.Q9_URL).toBe("https://example.com/vocale.webm");
    expect(testPanel.variables.Q9_R1).toBe("Il prezzo");
    expect(testPanel.variables.Q33).toBe("1");

    const controlPanel = await runTestInterview(
      withMockedServices(typebot, { initialValues: { panel: "CONTROL" } }),
      ["Certamente acquisterei", "Perché mi piace"],
    );
    const controlTranscript = controlPanel.transcript.join("\n");
    expect(controlTranscript).toContain("Estathé bottiglietta 400ml");
    expect(controlTranscript).not.toContain("Come hai trovato la lattina");
    expect(controlTranscript).not.toContain("Cosa ti spinge di più?");
    expect(controlPanel.variables.Q9).toBe("Perché mi piace");
  });
});

describe("Airtable frame", () => {
  const airtableSpec: QuestionnaireSpec = {
    ...shopperSpec,
    privacyUrl: "https://example.com/privacy.pdf",
    airtable: {
      baseId: "appTEST",
      tableId: "tblTEST",
      lookupField: "Telefono",
      linkParameter: "uid",
      loadFields: [{ airtableField: "PDV assegnato", variable: "pdv" }],
    },
  };
  const { typebot, warnings } = convertQuestionnaireSpecToTypebot(
    airtableSpec,
    { openAiCredentialsId: "cred_openai" },
  );
  const groupTitles = typebot.groups.map((group) => group.title);
  const httpBodies = typebot.groups.flatMap((group) =>
    group.blocks.flatMap((block) => {
      const options = (block.options ?? {}) as {
        webhook?: { method?: string; url?: string; body?: string };
      };
      return block.type === "Webhook" && options.webhook
        ? [{ group: group.title, ...options.webhook }]
        : [];
    }),
  );

  it("loads the respondent, saves each answer live and lists the columns to create", () => {
    expect(groupTitles.slice(0, 4)).toEqual([
      "SETTA SPECIFICHE AIRTABLE",
      "PRENDI INFO RESPONDENT E VERIFICA",
      "ERRORE - link non valido",
      "PREPARAZIONE",
    ]);
    const lookup = httpBodies.find((request) => request.method === "GET");
    expect(lookup?.url).toContain('filterByFormula={Telefono}="{{uid}}"');
    const q8Patch = httpBodies.find((request) => request.group === "Q8");
    expect(JSON.parse(q8Patch?.body ?? "{}")).toMatchObject({
      fields: {
        Q8: "{{Q8_TESTO}}",
        Checkpoint: "Q8",
        Status: "CHATBOT IN CORSO - Q8",
      },
      typecast: true,
    });
    const q9Patch = httpBodies.find((request) => request.group === "Q9");
    expect(Object.keys(JSON.parse(q9Patch?.body ?? "{}").fields)).toEqual(
      expect.arrayContaining(["Q9", "Q9_URL", "Q9_RILANCI"]),
    );
    expect(warnings.join("\n")).toContain("Q9_RILANCI");
    expect(warnings.join("\n")).toContain("PDV assegnato");
    expect(
      importTypebotInputSchema.safeParse({
        workspaceId: "w",
        typebot: { ...typebot, icon: null, folderId: null },
      }).success,
    ).toBe(true);
  });

  it("starts new respondents from the privacy notice", async () => {
    const newRespondent = await runTestInterview(
      withMockedServices(typebot, {
        initialValues: { record_id_airtable: "rec1", panel: "TEST" },
      }),
      ["✅ Ho preso visione", "Certamente acquisterei"],
    );
    const transcript = newRespondent.transcript.join("\n");
    expect(transcript).toContain("INFORMATIVA PRIVACY");
    expect(transcript).toContain("Quanto sei propenso");
    expect(newRespondent.variables.checkpoint).toBe("Q8");
    expect(JSON.parse(String(newRespondent.variables.stato_json))).toEqual({
      Q8: "1",
      Q8_TESTO: "Certamente acquisterei",
    });
  });

  it("resumes after the last answered question, with the answers restored", async () => {
    const returning = await runTestInterview(
      withMockedServices(typebot, {
        initialValues: {
          record_id_airtable: "rec1",
          panel: "TEST",
          checkpoint: "Q8",
          stato_json: JSON.stringify({
            Q8: "2",
            Q8_TESTO: "Probabilmente acquisterei",
          }),
        },
      }),
      ["Perché costa poco"],
    );
    const transcript = returning.transcript.join("\n");
    expect(transcript).not.toContain("INFORMATIVA PRIVACY");
    expect(transcript).not.toContain("Quanto sei propenso");
    expect(transcript).toContain("«Probabilmente acquisterei»");
    expect(returning.variables.Q8).toBe("2");
  });

  it("stops respondents without an Airtable record", async () => {
    const stranger = await runTestInterview(
      withMockedServices(typebot, {}),
      [],
    );
    expect(stranger.transcript.join("\n")).toContain(
      "Devi utilizzare il link che hai ricevuto",
    );
  });
});

describe("Airtable resume with routing", () => {
  const { typebot } = convertQuestionnaireSpecToTypebot({
    ...spec,
    introText: null,
    airtable: {
      baseId: "appTEST",
      tableId: "tblTEST",
      lookupField: "Telefono",
      linkParameter: "uid",
      loadFields: [],
    },
    questions: [
      ...spec.questions.slice(0, 2),
      question({
        code: "ACQ",
        type: "continue",
        text: "Ora acquista il prodotto e torna qui quando l'hai provato.",
        options: [option("1", "▶️ CONTINUA")],
      }),
      ...spec.questions.slice(2),
    ],
  });
  const matrixBlockId = typebot.groups
    .find((group) => group.title === "D3")
    ?.blocks.find((block) => block.type === "matrix input")?.id;

  it("skips the questions the routing excludes, like a respondent who never left", async () => {
    const returning = await runTestInterview(
      withMockedServices(typebot, {
        initialValues: {
          record_id_airtable: "rec1",
          checkpoint: "ACQ",
          stato_json: JSON.stringify({ S1: "35", D1: "2" }),
        },
      }),
      [],
    );
    // D1 = No: D2 and D2b are skipped, the next question is the grid.
    expect(returning.inputBlockIds.at(-1)).toBe(matrixBlockId);
    expect(returning.transcript.join("\n")).not.toContain("Con quali mezzi?");
  });

  it("saves the checkpoint before the continue button", async () => {
    const respondent = await runTestInterview(
      withMockedServices(typebot, {
        initialValues: { record_id_airtable: "rec1" },
      }),
      ["35", "No"],
    );
    expect(respondent.transcript.join("\n")).toContain(
      "Ora acquista il prodotto",
    );
    expect(respondent.variables.checkpoint).toBe("ACQ");
  });
});

describe("option routing (Passare a / Terminare / Ripetere)", () => {
  const storeSpec: QuestionnaireSpec = {
    ...spec,
    introText: null,
    airtable: {
      baseId: "appTEST",
      tableId: "tblTEST",
      lookupField: "Telefono",
      linkParameter: "uid",
      loadFields: [],
    },
    questions: [
      question({
        code: "Q2",
        type: "single",
        text: "Cerca l'espositore. L'hai trovato?",
        options: [
          option("1", "L'ho trovato", { goTo: "Q5" }),
          option("2", "Non lo vedo", { goTo: "Q3" }),
        ],
      }),
      question({
        code: "Q3",
        type: "single",
        text: "Cerca meglio vicino alle casse.",
        options: [
          option("1", "Ora l'ho trovato", { goTo: "Q5" }),
          option("2", "Non c'è", { goTo: "Q4" }),
        ],
      }),
      question({
        code: "Q4",
        type: "single",
        text: "Il prodotto non c'è: chiudi o torni un altro giorno?",
        options: [
          option("1", "CHIUDO QUI!", { goTo: "END" }),
          option("2", "RITORNO", { goTo: "RETURN:Q2" }),
        ],
      }),
      question({
        code: "Q5",
        type: "single",
        text: "Quale espositore hai trovato?",
        options: [option("1", "Pozzetto"), option("2", "Frigo")],
      }),
    ],
  };
  const { typebot, warnings } = convertQuestionnaireSpecToTypebot(storeSpec);
  const respondent = (initialValues: Record<string, string> = {}) =>
    withMockedServices(typebot, {
      initialValues: { record_id_airtable: "rec1", ...initialValues },
    });

  it("jumps from the option to the question it names", async () => {
    expect(
      warnings.filter((warning) => !warning.startsWith("Airtable")),
    ).toEqual([]);
    const found = await runTestInterview(respondent(), ["L'ho trovato"]);
    const transcript = found.transcript.join("\n");
    expect(transcript).toContain("Quale espositore hai trovato?");
    expect(transcript).not.toContain("Cerca meglio");
  });

  it("closes the interview or pauses it until the respondent comes back", async () => {
    const closed = await runTestInterview(respondent(), [
      "Non lo vedo",
      "Non c'è",
      "CHIUDO QUI!",
    ]);
    expect(closed.transcript.join("\n")).toContain("l'intervista termina qui");
    expect(closed.variables.checkpoint).toBe("SCREENOUT");

    const paused = await runTestInterview(respondent(), [
      "Non lo vedo",
      "Non c'è",
      "RITORNO",
    ]);
    expect(paused.transcript.join("\n")).toContain("riapri questo link");
    expect(paused.variables.checkpoint).toBe("RIPRENDI:Q2");

    const back = await runTestInterview(
      respondent({ checkpoint: "RIPRENDI:Q2" }),
      [],
    );
    expect(back.transcript.join("\n")).toContain("Cerca l'espositore");
  });

  it("jumps to the question of the respondent's path (Passare a Q4/Q4a)", async () => {
    const onlyFor = (value: string) => ({
      logic: "all" as const,
      conditions: [
        {
          questionCode: "espositore",
          operator: "anyOf" as const,
          values: [value],
        },
      ],
    });
    const pathSpec: QuestionnaireSpec = {
      ...spec,
      introText: null,
      linkVariables: [{ name: "espositore", description: "SLIM o POZZETTO" }],
      questions: [
        question({
          code: "Q6",
          type: "single",
          text: "Trovi il prodotto nell'espositore?",
          options: [option("1", "Sì"), option("2", "No", { goTo: "Q4/q4a" })],
        }),
        question({
          code: "Q4",
          type: "single",
          text: "Slim: il prodotto non c'è.",
          options: [option("1", "Ok")],
          showIf: onlyFor("SLIM"),
        }),
        question({
          code: "Q4a",
          type: "single",
          text: "Pozzetto: il prodotto non c'è.",
          options: [option("1", "Ok")],
          showIf: onlyFor("POZZETTO"),
        }),
        question({
          code: "Q7",
          type: "single",
          text: "Quanto ti attira?",
          options: [option("1", "Molto")],
        }),
      ],
    };
    const { typebot: pathBot, warnings: pathWarnings } =
      convertQuestionnaireSpecToTypebot(pathSpec);
    expect(pathWarnings).toEqual([]);
    for (const [espositore, expected, other] of [
      ["SLIM", "Slim:", "Pozzetto:"],
      ["POZZETTO", "Pozzetto:", "Slim:"],
    ]) {
      const interview = await runTestInterview(
        withMockedServices(pathBot, { initialValues: { espositore } }),
        ["No"],
      );
      const transcript = interview.transcript.join("\n");
      expect(transcript).toContain(expected);
      expect(transcript).not.toContain(other);
    }
  });

  it("applies the routing of the last answer when resuming", async () => {
    const resumed = await runTestInterview(
      respondent({
        checkpoint: "Q2",
        stato_json: JSON.stringify({ Q2: "1", Q2_TESTO: "L'ho trovato" }),
      }),
      [],
    );
    const transcript = resumed.transcript.join("\n");
    expect(transcript).toContain("Quale espositore hai trovato?");
    expect(transcript).not.toContain("Cerca meglio");
  });
});

describe("stimuli repeated in random order (Ripetere G1–G2 dopo ciascun video)", () => {
  const stimulus = (label: string, allowReplay = false) => ({
    type: "video" as const,
    url: null,
    label,
    allowReplay,
  });
  const videoSpec: QuestionnaireSpec = {
    ...spec,
    introText: null,
    questions: [
      question({ code: "Q1", type: "open", text: "Come ti chiami?" }),
      question({
        code: "G1",
        type: "open",
        text: "Cosa ricordi di {{VIDEO}}?",
      }),
      question({
        code: "G2",
        type: "single",
        text: "Ti è piaciuto?",
        options: [option("1", "Sì"), option("2", "No")],
      }),
      question({
        code: "G2a",
        type: "open",
        text: "Perché ti è piaciuto?",
        showIf: {
          logic: "all",
          conditions: [
            { questionCode: "G2", operator: "anyOf", values: ["1"] },
          ],
        },
      }),
      question({ code: "G9", type: "open", text: "Quale ricordi meglio?" }),
    ],
    loops: [
      {
        name: "VIDEO",
        firstQuestion: "G1",
        lastQuestion: "G2a",
        isRandomized: true,
        items: [
          { code: "A", label: "Video A", stimulus: stimulus("Spot A", true) },
          { code: "B", label: "Video B", stimulus: stimulus("Spot B") },
          { code: "C", label: "Video C", stimulus: stimulus("Spot C") },
        ],
      },
    ],
  };
  const { typebot, warnings } = convertQuestionnaireSpecToTypebot(videoSpec);

  it("writes one block per video, with the video before its first question", () => {
    expect(
      importTypebotInputSchema.safeParse({
        workspaceId: "w",
        typebot: { ...typebot, icon: null, folderId: null },
      }).success,
    ).toBe(true);
    const titles = typebot.groups.map((group) => group.title);
    for (const code of ["G1_A", "G2_B", "G2a_C", "ROTAZIONE VIDEO"])
      expect(titles).toContain(code);
    const g1b = typebot.groups.find((group) => group.title === "G1_B");
    expect(g1b?.blocks[0]).toMatchObject({
      type: "video",
      content: { watchTracking: { isEnabled: true, isRequired: true } },
    });
    expect(warnings.join("\n")).toContain("Spot A → G1_A");
  });

  it("shows every block once, in the drawn order, then the questions after", async () => {
    const originalRandom = Math.random;
    Math.random = () => 0;
    try {
      const interview = await runTestInterview(
        withMockedServices(typebot, {}),
        [
          "Simone",
          "ricordo B",
          "No",
          "ricordo C",
          "Sì",
          "perché sì",
          "🔁 Rivedi il video",
          "ricordo A",
          "No",
          "B",
        ],
      );
      const transcript = interview.transcript.join("\n");
      const positions = ["Video B", "Video C", "Video A", "Quale ricordi"].map(
        (text) => transcript.indexOf(text),
      );
      expect(positions.every((position) => position >= 0)).toBe(true);
      expect([...positions].sort((a, b) => a - b)).toEqual(positions);
      expect(interview.variables).toMatchObject({
        ordine_VIDEO: "B,C,A",
        G1_B: "ricordo B",
        G2a_C: "perché sì",
        G1_A_RIVISTO: "Sì",
        G1_A: "ricordo A",
        G9: "B",
      });
      expect(interview.variables.G2a_B).toBeUndefined();
    } finally {
      Math.random = originalRandom;
    }
  });
});
