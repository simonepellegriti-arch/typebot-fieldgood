import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { groupV6Schema } from "@typebot.io/groups/schemas";
import { variableSchema } from "@typebot.io/variables/schemas";
import { z } from "zod";
import { applyQuestionnaireCoding } from "./applyQuestionnaireCoding";
import { matchQuestionnaireCoding } from "./matchQuestionnaireCoding";
import { parseDocxQuestionnaire } from "./parseDocxQuestionnaire";
import { parseQuestionnaireCoding } from "./parseQuestionnaireCoding";

// Real .docx written by python-docx (paragraphs, tabs, a table for the scale).
const docxBytes = new Uint8Array(
  readFileSync(join(import.meta.dir, "fixtures", "questionario.docx")),
);

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
      textBubble("t1", "Genere"),
      {
        id: "b_gender",
        type: "choice input",
        items: [
          { id: "i_m", content: "Uomo" },
          { id: "i_f", content: "Donna", value: "F" },
          { id: "i_o", content: "Altro" },
          { id: "i_n", content: "Preferisco non rispondere" },
        ],
        options: { variableId: "v_gender" },
      },
      textBubble("t2", "Quali marche conosci?"),
      {
        id: "b_brands",
        type: "choice input",
        items: [
          { id: "k_nike", content: "Nike" },
          { id: "k_adidas", content: "Adidas" },
          { id: "k_puma", content: "Puma" },
          { id: "k_other", content: "Altro, specificare" },
          { id: "k_none", content: "Nessuna" },
        ],
        options: { variableId: "v_d2", isMultipleChoice: true },
      },
      {
        id: "b_matrix",
        type: "matrix input",
        options: {
          question: "Quanto sei soddisfatto dei seguenti aspetti?",
          rows: [
            { id: "r_q", label: "Qualità del prodotto" },
            { id: "r_p", label: "Prezzo" },
          ],
          columns: [
            { id: "c1", label: "Per niente" },
            { id: "c2", label: "Poco" },
            { id: "c3", label: "Abbastanza" },
            { id: "c4", label: "Molto" },
          ],
        },
      },
      textBubble("t4", "Quanti anni hai?"),
      { id: "b_age", type: "number input", options: { variableId: "v_age" } },
      textBubble("t5", "Qual è la tua email?"),
      { id: "b_email", type: "email input", options: { variableId: "v_mail" } },
    ],
  },
]);

const variables = z.array(variableSchema).parse([
  { id: "v_gender", name: "GENDER" },
  { id: "v_d2", name: "D2" },
  { id: "v_age", name: "ETA" },
  { id: "v_mail", name: "EMAIL" },
]);

describe("Word questionnaire parsing", () => {
  it("reads questions, codes, kinds, scores, exclusive, other and routing", async () => {
    const { questions } = await parseDocxQuestionnaire(docxBytes);
    expect(
      questions.map(({ variableName, text, kind }) => ({
        variableName,
        text,
        kind,
      })),
    ).toEqual([
      { variableName: "D1", text: "Genere", kind: "single" },
      {
        variableName: "D2",
        text: "Quali marche di scarpe sportive conosci, anche solo di nome?",
        kind: "multiple",
      },
      {
        variableName: "D3",
        text: "Quanto sei soddisfatto dei seguenti aspetti?",
        kind: "matrix",
      },
      { variableName: "D4", text: "Quanti anni hai?", kind: "open" },
      { variableName: "D5", text: "Pratichi sport?", kind: "single" },
    ]);
    const [gender, brands, matrix, , sport] = questions;
    expect(gender?.options).toEqual([
      { code: "1", label: "Uomo" },
      { code: "2", label: "Donna" },
      { code: "3", label: "Altro" },
      { code: "99", label: "Preferisco non rispondere", isExclusive: true },
    ]);
    expect(brands?.options).toEqual([
      { code: "1", label: "Nike", score: 5 },
      { code: "2", label: "Adidas", score: 3 },
      { code: "3", label: "Puma" },
      { code: "98", label: "Altro, specificare", hasTextInput: true },
      { code: "99", label: "Nessuna di queste", isExclusive: true },
    ]);
    expect(matrix?.rows.map(({ code, label }) => [code, label])).toEqual([
      ["1", "Qualità del prodotto"],
      ["2", "Prezzo"],
    ]);
    expect(matrix?.options.map(({ code }) => code)).toEqual([
      "1",
      "2",
      "3",
      "4",
    ]);
    expect(sport?.options).toEqual([
      { code: "1", label: "Sì" },
      { code: "2", label: "No", routing: "D7" },
    ]);
    expect(sport?.routing).toContain("SE D5=2 PASSARE A D7");
  });

  it("accepts the usual code notations", () => {
    const [question] = parseQuestionnaireCoding([
      "Q10) Frequenza di acquisto",
      "(1) Ogni settimana",
      "2 = Ogni mese",
      "Raramente .......... 3",
      "4 - Mai",
    ]);
    expect(question?.variableName).toBe("Q10");
    expect(question?.options.map(({ code, label }) => [code, label])).toEqual([
      ["1", "Ogni settimana"],
      ["2", "Ogni mese"],
      ["3", "Raramente"],
      ["4", "Mai"],
    ]);
  });
});

describe("Word ↔ Typebot mapping", () => {
  it("proposes matches and reports every category", async () => {
    const { questions } = await parseDocxQuestionnaire(docxBytes);
    const proposal = matchQuestionnaireCoding(questions, { groups, variables });
    const byName = Object.fromEntries(
      proposal.questions.map((mapping) => [
        mapping.wordQuestion.variableName,
        mapping,
      ]),
    );
    // Same label ("Genere") → matched although the variable is GENDER.
    expect(byName.D1).toMatchObject({
      status: "MATCHED",
      blockId: "b_gender",
      matchReason: "label",
    });
    // Variable name D2 → matched; "Nessuna di queste" ≠ "Nessuna": needs a confirmation.
    expect(byName.D2).toMatchObject({
      blockId: "b_brands",
      matchReason: "variableName",
      status: "UNMATCHED",
    });
    expect(
      byName.D2?.options.find((option) => option.wordOption?.code === "99"),
    ).toMatchObject({
      targetId: "k_none",
      status: "AMBIGUOUS",
      isConfirmed: false,
    });
    expect(byName.D3).toMatchObject({ blockId: "b_matrix", status: "MATCHED" });
    expect(byName.D4).toMatchObject({ blockId: "b_age", status: "MATCHED" });
    expect(byName.D5).toMatchObject({ status: "MISSING_IN_TYPEBOT" });
    expect(proposal.missingInWord.map(({ blockId }) => blockId)).toEqual([
      "b_email",
    ]);
  });

  it("applies only reviewed codes and never changes labels", async () => {
    const { questions } = await parseDocxQuestionnaire(docxBytes);
    const proposal = matchQuestionnaireCoding(questions, { groups, variables });
    const result = applyQuestionnaireCoding({ groups, variables }, proposal, {
      createVariableId: () => "v_new",
    });
    const blocks = result.groups.flatMap((group) => group.blocks);
    const gender = blocks.find((block) => block.id === "b_gender");
    const brands = blocks.find((block) => block.id === "b_brands");
    const matrix = blocks.find((block) => block.id === "b_matrix");
    expect(gender && "items" in gender ? gender.items : []).toEqual([
      expect.objectContaining({ id: "i_m", content: "Uomo", value: "1" }),
      expect.objectContaining({ id: "i_f", content: "Donna", value: "2" }),
      expect.objectContaining({ id: "i_o", content: "Altro", value: "3" }),
      expect.objectContaining({
        id: "i_n",
        content: "Preferisco non rispondere",
        value: "99",
        isExclusive: true,
      }),
    ]);
    const brandItems = brands && "items" in brands ? brands.items : [];
    expect(brandItems).toContainEqual(
      expect.objectContaining({ id: "k_nike", value: "1", score: 5 }),
    );
    expect(brandItems).toContainEqual(
      expect.objectContaining({
        id: "k_other",
        value: "98",
        hasTextInput: true,
      }),
    );
    // Ambiguous and not confirmed: left untouched.
    expect(brandItems.find((item) => item.id === "k_none")).not.toHaveProperty(
      "value",
    );
    expect(
      matrix?.type === "matrix input"
        ? matrix.options?.rows?.map(({ label, value }) => [label, value])
        : [],
    ).toEqual([
      ["Qualità del prodotto", "1"],
      ["Prezzo", "2"],
    ]);
    // The matrix had no variable: D3 is created (proposed by default).
    expect(result.variables).toContainEqual({ id: "v_new", name: "D3" });
    // Existing variable names are kept unless asked.
    expect(result.variables).toContainEqual({ id: "v_gender", name: "GENDER" });
    expect(result.changes.length).toBeGreaterThan(0);

    const confirmedProposal = {
      ...proposal,
      questions: proposal.questions.map((mapping) => ({
        ...mapping,
        shouldSetVariableName: mapping.wordQuestion.variableName === "D1",
        options: mapping.options.map((option) => ({
          ...option,
          isConfirmed: true,
        })),
      })),
    };
    const confirmedResult = applyQuestionnaireCoding(
      { groups, variables },
      confirmedProposal,
      { createVariableId: () => "v_new" },
    );
    const confirmedBrands = confirmedResult.groups
      .flatMap((group) => group.blocks)
      .find((block) => block.id === "b_brands");
    expect(
      confirmedBrands && "items" in confirmedBrands
        ? confirmedBrands.items.find((item) => item.id === "k_none")
        : undefined,
    ).toMatchObject({ content: "Nessuna", value: "99", isExclusive: true });
    expect(confirmedResult.variables).toContainEqual({
      id: "v_gender",
      name: "D1",
    });
  });

  it("ignores questions the user ignored", async () => {
    const { questions } = await parseDocxQuestionnaire(docxBytes);
    const proposal = matchQuestionnaireCoding(questions, { groups, variables });
    const result = applyQuestionnaireCoding(
      { groups, variables },
      {
        ...proposal,
        questions: proposal.questions.map((mapping) => ({
          ...mapping,
          isIgnored: true,
        })),
      },
      { createVariableId: () => "v_new" },
    );
    expect(result.groups).toEqual(groups);
    expect(result.variables).toEqual(variables);
    expect(result.changes).toEqual([]);
  });
});
