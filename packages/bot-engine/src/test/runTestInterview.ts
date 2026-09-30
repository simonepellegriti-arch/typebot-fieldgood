import type { Message } from "@typebot.io/chat-api/schemas";
import type { SessionState } from "@typebot.io/chat-session/schemas";
import type { Answer } from "@typebot.io/results/schemas/answers";

// The Prisma client is created on import; preview interviews never query it.
process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test";

const { sessionStateSchema } = await import("@typebot.io/chat-session/schemas");
const { SessionStore } = await import("@typebot.io/runtime-session-store");
const { continueBotFlow } = await import("../continueBotFlow");

/**
 * Runs a whole interview through the real engine (start + replies), in preview
 * mode: nothing touches the database and the answers, with the same research
 * fields as saved results (value, score, loop context...), are read from the
 * session preview metadata.
 */
export const runTestInterview = async (
  typebot: Record<string, unknown>,
  replies: (string | Message)[],
) => {
  const sessionStore = new SessionStore();
  let state: SessionState = sessionStateSchema.parse({
    version: "3",
    workspaceId: "workspace",
    typebotsQueue: [{ typebot, answers: [] }],
  });
  const transcript: string[] = [];
  const inputBlockIds: (string | undefined)[] = [];
  for (const reply of [undefined, ...replies]) {
    const response = await continueBotFlow(
      typeof reply === "string" ? { type: "text", text: reply } : reply,
      { state, version: 2, sessionStore, textBubbleContentFormat: "richText" },
    );
    state = response.newSessionState;
    transcript.push(...getMessageTexts(response.messages));
    inputBlockIds.push(response.input?.id);
  }
  const variables = Object.fromEntries(
    state.typebotsQueue[0].typebot.variables.map((variable) => [
      variable.name,
      variable.value,
    ]),
  );
  const answers: Answer[] = state.previewMetadata?.answers ?? [];
  return { state, transcript, inputBlockIds, variables, answers };
};

const getMessageTexts = (messages: { content?: unknown }[]) =>
  messages.map((message) => collectTexts(message.content).join(""));

const collectTexts = (node: unknown): string[] => {
  if (Array.isArray(node)) return node.flatMap(collectTexts);
  if (!node || typeof node !== "object") return [];
  const ownText =
    "text" in node && typeof node.text === "string" ? [node.text] : [];
  return [...ownText, ...Object.values(node).flatMap(collectTexts)];
};
