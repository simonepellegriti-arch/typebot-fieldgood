import { isInputBlock } from "@typebot.io/blocks-core/helpers";
import type { SessionState } from "@typebot.io/chat-session/schemas";
import { decrypt } from "@typebot.io/credentials/decrypt";
import prisma from "@typebot.io/prisma";
import { updateAirtableRecord } from "./airtableClient";
import { getAirtableAnswerFields } from "./getAirtableAnswerFields";
import {
  airtableStandardFields,
  airtableTokenSchema,
  parseParticipantAirtable,
  parseParticipantPanelColumns,
  participantStatusLabels,
} from "./schemas";

/**
 * After each step of a respondent's interview: status, checkpoint (last
 * question answered) and last activity on the participant, then the same
 * plus the answers on its Airtable record (the client's dashboard).
 * Never throws: the interview must go on even when Airtable doesn't answer.
 */
export const updateParticipantProgress = async ({
  participantId,
  state,
  answeredBlockId,
  isStart = false,
  isCompleted,
}: {
  participantId: string;
  state: SessionState;
  answeredBlockId?: string;
  isStart?: boolean;
  isCompleted: boolean;
}) => {
  try {
    const now = new Date();
    const checkpoint = answeredBlockId
      ? getCheckpointName(state, answeredBlockId)
      : undefined;
    const status = isCompleted ? "COMPLETED" : "IN_PROGRESS";
    const participant = await prisma.participant.update({
      where: { id: participantId },
      data: {
        status,
        lastActivityAt: now,
        ...(checkpoint ? { checkpoint } : {}),
        ...(isCompleted ? { completedAt: now } : {}),
        ...(isStart
          ? {
              startedAt: now,
              resultId: state.typebotsQueue[0].resultId,
              completedAt: null,
            }
          : {}),
      },
      select: {
        typebotId: true,
        checkpoint: true,
        airtableRecordId: true,
      },
    });
    if (!participant.airtableRecordId) return;

    const panel = await prisma.participantPanel.findUnique({
      where: { typebotId: participant.typebotId },
      select: {
        columns: true,
        airtable: true,
        airtableTokenData: true,
        airtableTokenIv: true,
      },
    });
    const airtable = parseParticipantAirtable(panel?.airtable);
    if (!panel?.airtableTokenData || !panel.airtableTokenIv || !airtable)
      return;
    const { token } = airtableTokenSchema.parse(
      await decrypt(panel.airtableTokenData, panel.airtableTokenIv),
    );
    const listColumns = parseParticipantPanelColumns(panel.columns).mappings;
    const excludedNames = new Set<string>([
      ...Object.values(airtableStandardFields),
      ...listColumns.map((mapping) => mapping.column),
      ...listColumns.flatMap((mapping) =>
        mapping.variableName ? [mapping.variableName] : [],
      ),
    ]);
    const fieldNames = new Set(airtable.fieldNames);
    const standardFields = Object.fromEntries(
      [
        [airtableStandardFields.status, participantStatusLabels[status]],
        [airtableStandardFields.checkpoint, participant.checkpoint ?? ""],
        [airtableStandardFields.lastActivity, now.toISOString()],
      ].filter(([name]) => fieldNames.has(name ?? "")),
    );
    await updateAirtableRecord(
      token,
      {
        baseId: airtable.baseId,
        tableId: airtable.tableId,
        recordId: participant.airtableRecordId,
      },
      {
        ...getAirtableAnswerFields(state, {
          fieldNames: airtable.fieldNames,
          excludedNames,
        }),
        ...standardFields,
      },
    );
  } catch (error) {
    console.error("Participant progress update failed", error);
  }
};

/** Name of the question just answered: its variable, else its group title. */
const getCheckpointName = (state: SessionState, blockId: string) => {
  const { typebot } = state.typebotsQueue[0];
  const group = typebot.groups.find((candidate) =>
    candidate.blocks.some((block) => block.id === blockId),
  );
  const block = group?.blocks.find((candidate) => candidate.id === blockId);
  const variableId =
    block && isInputBlock(block) ? block.options?.variableId : undefined;
  return (
    typebot.variables.find((variable) => variable.id === variableId)?.name ??
    group?.title
  );
};
