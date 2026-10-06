import { ORPCError } from "@orpc/server";
import { BubbleBlockType } from "@typebot.io/blocks-bubbles/constants";
import { isBubbleBlock, isInputBlock } from "@typebot.io/blocks-core/helpers";
import type { ContinueChatResponse } from "@typebot.io/chat-api/schemas";
import { getSession } from "@typebot.io/chat-session/queries/getSession";
import type { SessionState } from "@typebot.io/chat-session/schemas";
import prisma from "@typebot.io/prisma";
import { withSessionStore } from "@typebot.io/runtime-session-store";
import { deepParseVariables } from "@typebot.io/variables/deepParseVariables";
import { computeCurrentProgress } from "../computeCurrentProgress";
import { formatInputForChatResponse } from "../formatInputForChatResponse";
import { assertOriginIsAllowed } from "../helpers/assertOriginIsAllowed";
import {
  type BubbleBlockWithDefinedContent,
  parseBubbleBlock,
} from "../parseBubbleBlock";
import { parseDynamicTheme } from "../parseDynamicTheme";
import { getTypebot, sanitizeAndParseTheme } from "../startSession";
import {
  getParticipantVariables,
  parseParticipantPanelColumns,
  participantLinkParameter,
} from "./schemas";

const messagesText = {
  invalidLink:
    "Questo link non è valido. Apri la chat dal link personale che hai ricevuto.",
  resumed: "👋 Eccoci di nuovo! Riprendiamo da dove eravamo rimasti.",
  completed:
    "Hai già completato l'intervista: grazie ancora per la tua partecipazione! 🙏",
};

type Context = { origin?: string; iframeReferrerOrigin?: string };

/**
 * Start of a chat opened from a respondent list link (…?pid=token):
 * - a session in progress is resumed exactly where it was left, from any device;
 * - a completed interview shows a thank-you message;
 * - otherwise a new interview starts with the list values as variables.
 * Bots with a list and isLinkRequired refuse links without a valid token.
 */
export const prepareParticipantStart = async ({
  publicId,
  prefilledVariables,
  textBubbleContentFormat,
  context,
}: {
  publicId: string;
  prefilledVariables: Record<string, unknown> | undefined;
  textBubbleContentFormat: "richText" | "markdown";
  context: Context;
}) => {
  const token = prefilledVariables?.[participantLinkParameter];
  if (typeof token !== "string" || !token.trim()) {
    const panel = await prisma.participantPanel.findFirst({
      where: { typebot: { publicId } },
      select: { columns: true },
    });
    if (panel && parseParticipantPanelColumns(panel.columns).isLinkRequired)
      throw new ORPCError("FORBIDDEN", { message: messagesText.invalidLink });
    return { type: "anonymous" as const };
  }

  const participant = await prisma.participant.findFirst({
    where: { token: token.trim(), typebot: { publicId } },
    select: {
      id: true,
      data: true,
      status: true,
      resultId: true,
      typebot: { select: { participantPanel: { select: { columns: true } } } },
    },
  });
  if (!participant)
    throw new ORPCError("FORBIDDEN", { message: messagesText.invalidLink });

  const result = participant.resultId
    ? await prisma.result.findUnique({
        where: { id: participant.resultId },
        select: { isCompleted: true, lastChatSessionId: true },
      })
    : null;
  const session = result?.lastChatSessionId
    ? await getSession(result.lastChatSessionId)
    : null;

  if (session?.state?.version === "3" && session.state.currentBlockId) {
    const state = session.state;
    assertOriginIsAllowed(context.origin, {
      allowedOrigins: state.allowedOrigins,
      iframeReferrerOrigin: context.iframeReferrerOrigin,
    });
    return {
      type: "response" as const,
      response: await buildResumeResponse({
        sessionId: session.id,
        state,
        publicId,
        textBubbleContentFormat,
      }),
    };
  }

  if (result?.isCompleted || participant.status === "COMPLETED")
    return {
      type: "response" as const,
      response: await buildCompletedResponse({
        publicId,
        textBubbleContentFormat,
      }),
    };

  const columns = parseParticipantPanelColumns(
    participant.typebot.participantPanel?.columns,
  );
  const { [participantLinkParameter]: _token, ...urlVariables } =
    prefilledVariables ?? {};
  return {
    type: "start" as const,
    participantId: participant.id,
    // The list wins over the URL: respondents can't change their panel.
    prefilledVariables: {
      ...urlVariables,
      ...getParticipantVariables(participant.data, columns),
    },
  };
};

const buildResumeResponse = ({
  sessionId,
  state,
  publicId,
  textBubbleContentFormat,
}: {
  sessionId: string;
  state: SessionState;
  publicId: string;
  textBubbleContentFormat: "richText" | "markdown";
}) =>
  withSessionStore(sessionId, async (sessionStore) => {
    const typebot = await getTypebot({
      type: "live",
      publicId,
      isStreamEnabled: false,
      isOnlyRegistering: false,
      textBubbleContentFormat,
    });
    const typebotInSession = state.typebotsQueue[0].typebot;
    const variables = typebotInSession.variables;
    const bubbleContext = {
      version: 2 as const,
      variables,
      typebotVersion: typebotInSession.version,
      textBubbleContentFormat,
      sessionStore,
    };

    // What the respondent had on screen: the bubbles since the previous
    // question of the group, then the question waiting for an answer.
    const group = typebotInSession.groups.find((candidate) =>
      candidate.blocks.some((block) => block.id === state.currentBlockId),
    );
    const blocks = group?.blocks ?? [];
    const currentIndex = blocks.findIndex(
      (block) => block.id === state.currentBlockId,
    );
    let firstIndex = currentIndex;
    for (; firstIndex > 0; firstIndex--) {
      const previousBlock = blocks[firstIndex - 1];
      if (!previousBlock || isInputBlock(previousBlock)) break;
    }
    const currentBlock = blocks[currentIndex];
    const isWaitingForAnswer = Boolean(
      currentBlock && isInputBlock(currentBlock),
    );
    const bubbles = blocks
      .slice(firstIndex, isWaitingForAnswer ? currentIndex : currentIndex + 1)
      .filter(
        (block): block is BubbleBlockWithDefinedContent =>
          isBubbleBlock(block) && Boolean(block.content),
      );

    const messages: ContinueChatResponse["messages"] = [
      parseBubbleBlock(textBubble(messagesText.resumed), bubbleContext),
      ...bubbles.map((block) => parseBubbleBlock(block, bubbleContext)),
    ];
    const input =
      currentBlock && isInputBlock(currentBlock)
        ? await formatInputForChatResponse(currentBlock, {
            variables,
            isPreview: false,
            workspaceId: state.workspaceId,
            sessionStore,
          })
        : undefined;

    return {
      sessionId,
      typebot: {
        id: typebot.id,
        version: typebot.version,
        settings: deepParseVariables(typebot.settings, {
          variables,
          sessionStore,
        }),
        theme: sanitizeAndParseTheme(typebot.theme, {
          variables,
          sessionStore,
        }),
        publishedAt: typebot.updatedAt,
      },
      messages,
      input,
      resultId: state.typebotsQueue[0].resultId,
      dynamicTheme: parseDynamicTheme({ state, sessionStore }),
      logs: undefined,
      clientSideActions: undefined,
      progress: state.progressMetadata
        ? computeCurrentProgress({
            typebotsQueue: state.typebotsQueue,
            progressMetadata: state.progressMetadata,
            currentInputBlockId: input?.id,
          })
        : undefined,
    };
  });

const buildCompletedResponse = ({
  publicId,
  textBubbleContentFormat,
}: {
  publicId: string;
  textBubbleContentFormat: "richText" | "markdown";
}) =>
  withSessionStore(`completed-${publicId}`, async (sessionStore) => {
    const typebot = await getTypebot({
      type: "live",
      publicId,
      isStreamEnabled: false,
      isOnlyRegistering: false,
      textBubbleContentFormat,
    });
    return {
      sessionId: "",
      typebot: {
        id: typebot.id,
        version: typebot.version,
        settings: typebot.settings,
        theme: sanitizeAndParseTheme(typebot.theme, {
          variables: [],
          sessionStore,
        }),
        publishedAt: typebot.updatedAt,
      },
      messages: [
        parseBubbleBlock(textBubble(messagesText.completed), {
          version: 2,
          variables: [],
          typebotVersion: typebot.version,
          textBubbleContentFormat,
          sessionStore,
        }),
      ],
      input: undefined,
      resultId: undefined,
      dynamicTheme: undefined,
      logs: undefined,
      clientSideActions: undefined,
      progress: undefined,
    };
  });

const textBubble = (text: string): BubbleBlockWithDefinedContent => ({
  id: `participant-${text.length}`,
  type: BubbleBlockType.TEXT,
  content: { richText: [{ type: "p", children: [{ text }] }] },
});
