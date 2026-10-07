import { ORPCError } from "@orpc/server";
import {
  createAirtableField,
  getAirtableTable,
  renameAirtableField,
} from "@typebot.io/bot-engine/participants/airtableClient";
import { airtableStandardFields } from "@typebot.io/bot-engine/participants/schemas";
import prisma from "@typebot.io/prisma";
import type { User } from "@typebot.io/user/schemas";
import { z } from "zod";
import { getWorkspaceAiModels } from "@/features/questionnaireAssistant/helpers/getWorkspaceAiModels";
import { buildColumnHeaders, cleanHeader } from "../helpers/buildColumnHeaders";
import { getAnswerColumns } from "../helpers/getAnswerColumns";
import { synthesizeQuestionTitles } from "../helpers/synthesizeQuestionTitles";
import { getParticipantsTypebot } from "./getParticipantsTypebot";
import { getPanelAirtable } from "./sendParticipantsToAirtable";

export const createAirtableFieldsInputSchema = z.object({
  typebotId: z.string(),
  /** Headers edited by the researcher: variable → header. */
  headers: z.record(z.string(), z.string()).optional(),
  /** New AI titles for every column (edited headers are lost). */
  regenerate: z.boolean().optional(),
});

/**
 * Columns the dashboard needs: ID, link, status, checkpoint, last activity,
 * the list columns and one per answer, titled with the short question (AI
 * synthesis, kept once set). Fields named after the code or an older header
 * are renamed, missing ones created (the token needs schema.bases:write).
 * Long bots may need a second run: the work stops before the request times
 * out and says how many fields are left.
 */
export const handleCreateAirtableFields = async ({
  input: { typebotId, headers: editedHeaders, regenerate },
  context: { user },
}: {
  input: z.infer<typeof createAirtableFieldsInputSchema>;
  context: { user: Pick<User, "id" | "email"> };
}) => {
  const startedAt = Date.now();
  const typebot = await getParticipantsTypebot(typebotId, user, "write");
  const connection = await getPanelAirtable(typebotId);
  if (!connection)
    throw new ORPCError("BAD_REQUEST", { message: "Airtable non collegato" });
  const { token, airtable, columns: listColumns } = connection;
  const mappedVariableNames = new Set(
    listColumns.mappings.flatMap((mapping) =>
      mapping.variableName ? [mapping.variableName] : [],
    ),
  );
  const answerColumns = getAnswerColumns(
    typebot.groups,
    typebot.variables,
  ).filter((column) => !mappedVariableNames.has(column.variableName));
  const fixedFields = [
    ...new Set([
      ...Object.values(airtableStandardFields),
      ...listColumns.mappings.map((mapping) => mapping.column),
    ]),
  ];

  const previousHeaders = airtable.fieldMap ?? {};
  const currentHeaders: Record<string, string> = regenerate
    ? {}
    : { ...previousHeaders };
  for (const [variableName, header] of Object.entries(editedHeaders ?? {}))
    if (cleanHeader(header)) currentHeaders[variableName] = cleanHeader(header);
  const questionsToTitle = [
    ...new Map(
      answerColumns
        .filter((column) => !currentHeaders[column.variableName])
        .map((column) => [
          column.baseName,
          {
            code: column.baseName,
            text: column.questionText,
            previousText: column.previousQuestionText,
          },
        ]),
    ).values(),
  ];
  const titlesByQuestion = questionsToTitle.length
    ? await synthesizeQuestionTitles({
        models: (await getWorkspaceAiModels(typebot.workspaceId, titleModelIds))
          .models,
        questions: questionsToTitle,
      })
    : new Map<string, string>();
  const headers = buildColumnHeaders({
    columns: answerColumns,
    titlesByQuestion,
    currentHeaders,
    reservedHeaders: fixedFields,
  });

  const table = await getAirtableTable(token, {
    baseId: airtable.baseId,
    table: airtable.tableId,
  });
  // Saved first: the live sync writes under the new headers as soon as they exist.
  await prisma.participantPanel.update({
    where: { typebotId },
    data: { airtable: { ...airtable, fieldMap: headers } },
  });

  const fieldsByName = new Map(
    table.fields.map((field) => [field.name.toLowerCase(), field]),
  );
  const wantedNames = new Set(
    [...fixedFields, ...Object.values(headers)].map((name) =>
      name.toLowerCase(),
    ),
  );
  const operations: { name: string; renameFrom?: string }[] = [];
  for (const name of fixedFields)
    if (!fieldsByName.has(name.toLowerCase())) operations.push({ name });
  for (const column of answerColumns) {
    const header = headers[column.variableName];
    if (!header || fieldsByName.has(header.toLowerCase())) continue;
    // A field still named after the code or an older header is renamed.
    const oldField = [previousHeaders[column.variableName], column.variableName]
      .flatMap((name) => (name ? [fieldsByName.get(name.toLowerCase())] : []))
      .find((field) => field && !wantedNames.has(field.name.toLowerCase()));
    if (oldField) {
      fieldsByName.delete(oldField.name.toLowerCase());
      operations.push({ name: header, renameFrom: oldField.id });
    } else operations.push({ name: header });
  }

  let createdCount = 0;
  let renamedCount = 0;
  let remainingCount = 0;
  const failed: { name: string; error: string }[] = [];
  for (const [index, operation] of operations.entries()) {
    if (Date.now() - startedAt > timeBudgetMs) {
      remainingCount = operations.length - index;
      break;
    }
    try {
      if (operation.renameFrom) {
        await renameAirtableField(token, {
          baseId: airtable.baseId,
          tableId: table.id,
          fieldId: operation.renameFrom,
          name: operation.name,
        });
        renamedCount++;
      } else {
        await createAirtableField(token, {
          baseId: airtable.baseId,
          tableId: table.id,
          name: operation.name,
        });
        createdCount++;
      }
    } catch (error) {
      failed.push({
        name: operation.name,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    // Airtable allows 5 requests per second per base.
    await new Promise((resolve) => setTimeout(resolve, 220));
  }

  const refreshed = await getAirtableTable(token, {
    baseId: airtable.baseId,
    table: table.id,
  });
  await prisma.participantPanel.update({
    where: { typebotId },
    data: {
      airtable: {
        ...airtable,
        fieldMap: headers,
        fieldNames: refreshed.fieldNames,
        primaryFieldName: refreshed.primaryFieldName,
      },
    },
  });
  return {
    createdCount,
    renamedCount,
    remainingCount,
    failed,
    fieldNames: refreshed.fieldNames,
  };
};

/** Fast models are enough for short titles. */
const titleModelIds = {
  openai: ["gpt-5.4-mini", "gpt-4.1-mini", "gpt-4.1"],
  anthropic: ["claude-haiku-4-5", "claude-sonnet-4-6"],
} as const;

/** Stops before the serverless request limit; a second run finishes. */
const timeBudgetMs = 200_000;
