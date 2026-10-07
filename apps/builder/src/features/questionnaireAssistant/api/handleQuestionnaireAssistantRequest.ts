import { auth } from "@typebot.io/auth/lib/nextAuth";
import { env } from "@typebot.io/env";
import prisma from "@typebot.io/prisma";
import { WorkspaceRole } from "@typebot.io/prisma/enum";
import { typebotV6Schema } from "@typebot.io/typebot/schemas/typebot";
import {
  generateObject,
  type LanguageModel,
  NoObjectGeneratedError,
  type UserContent,
} from "ai";
import { z } from "zod";
import { isSameOriginRequest } from "@/features/auth/helpers/isSameOriginRequest";
import {
  handleImportTypebot,
  importTypebotInputSchema,
} from "@/features/typebot/api/handleImportTypebot";
import { isWriteTypebotForbidden } from "@/features/typebot/helpers/isWriteTypebotForbidden";
import { convertQuestionnaireSpecToTypebot } from "../helpers/convertQuestionnaireSpecToTypebot";
import { expandQuestionLoops } from "../helpers/expandQuestionLoops";
import { getWorkspaceAiModels } from "../helpers/getWorkspaceAiModels";
import {
  buildAssistantReply,
  questionnaireAssistantSystemPrompt,
} from "../helpers/questionnaireAssistantPrompt";
import {
  parseGeneratedQuestionnaireSpec,
  questionnaireSpecGenerationSchema,
} from "../helpers/questionnaireSpecGenerationSchema";
import type { QuestionnaireSpec } from "../questionnaireSpecSchema";

const requestSchema = z.object({
  workspaceId: z.string(),
  message: z.string().max(20_000),
  documents: z
    .array(
      z.discriminatedUnion("kind", [
        z.object({
          fileName: z.string().max(300),
          kind: z.literal("text"),
          text: z.string().max(250_000),
        }),
        z.object({
          fileName: z.string().max(300),
          kind: z.literal("pdf"),
          base64: z.string().max(4_500_000),
        }),
      ]),
    )
    .max(3),
  /** Follow-up: the questionnaire of the bot being edited. */
  previousSpec: z.unknown().optional(),
  typebotId: z.string().optional(),
});

/** Models tried in order (the first one the account can use). */
const modelIdsByProvider = {
  // The full model follows long questionnaires and their routing much better.
  openai: ["gpt-5.4", "gpt-5.4-mini", "gpt-4.1"],
  anthropic: ["claude-sonnet-4-6", "claude-sonnet-4-5"],
} as const;

/**
 * Questionnaire assistant: reads the attached documents and the researcher's
 * instructions with the workspace AI credentials, then creates the bot (or
 * updates the bot of the conversation).
 */
export const handleQuestionnaireAssistantRequest = async (request: Request) => {
  if (!isSameOriginRequest(request.headers, env.NEXTAUTH_URL))
    return errorResponse(403, "forbidden");
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return errorResponse(401, "unauthenticated");

  const parsedBody = requestSchema.safeParse(
    await request.json().catch(() => undefined),
  );
  if (!parsedBody.success) return errorResponse(400, "invalid-request");
  const { workspaceId, message, documents, typebotId } = parsedBody.data;
  // Specs of older conversations may miss newer fields: read them leniently.
  const parsedPreviousSpec =
    parsedBody.data.previousSpec === undefined
      ? undefined
      : parseGeneratedQuestionnaireSpec(parsedBody.data.previousSpec);
  if (parsedPreviousSpec && !parsedPreviousSpec.success)
    return errorResponse(400, "invalid-request");
  const previousSpec = parsedPreviousSpec?.data;
  if (!message.trim() && documents.length === 0)
    return errorResponse(400, "empty-request");

  const membership = await prisma.memberInWorkspace.findFirst({
    where: { workspaceId, userId },
    select: { role: true },
  });
  if (!membership || membership.role === WorkspaceRole.GUEST)
    return errorResponse(404, "workspace-not-found");

  const { models, openAiCredentialsId } = await getWorkspaceAiModels(
    workspaceId,
    modelIdsByProvider,
  );
  if (models.length === 0) return errorResponse(400, "no-ai-credentials");

  let spec: QuestionnaireSpec;
  try {
    spec = await generateQuestionnaireSpec({
      models,
      message,
      documents,
      previousSpec,
    });
  } catch (error) {
    console.error("Questionnaire assistant generation failed", error);
    return errorResponse(502, "ai-failed", describeGenerationError(error));
  }
  if (spec.questions.length === 0)
    return errorResponse(422, "no-questions", spec.notes.join("\n"));

  const { typebot, warnings } = convertQuestionnaireSpecToTypebot(spec, {
    openAiCredentialsId,
  });
  const user = { id: userId };
  let savedTypebot: { id: string; name: string };
  let isNewBot = true;
  if (typebotId) {
    const existingTypebot = await prisma.typebot.findFirst({
      where: { id: typebotId, workspaceId },
      select: {
        id: true,
        collaborators: { select: { userId: true, type: true } },
        workspace: {
          select: {
            isSuspended: true,
            isPastDue: true,
            members: { select: { userId: true, role: true } },
          },
        },
      },
    });
    if (
      !existingTypebot ||
      (await isWriteTypebotForbidden(existingTypebot, user))
    )
      return errorResponse(404, "typebot-not-found");
    const content = typebotV6Schema
      .pick({ groups: true, edges: true, variables: true, events: true })
      .parse(typebot);
    savedTypebot = await prisma.typebot.update({
      where: { id: existingTypebot.id },
      data: { ...content, name: typebot.name },
      select: { id: true, name: true },
    });
    isNewBot = false;
  } else {
    const { typebot: createdTypebot } = await handleImportTypebot({
      input: importTypebotInputSchema.parse({
        workspaceId,
        typebot: { ...typebot, icon: null, folderId: null },
      }),
      context: { user },
    });
    savedTypebot = { id: createdTypebot.id, name: createdTypebot.name };
  }

  // Counted as the respondents see them: repeated blocks written out.
  const { questions: botQuestions } = expandQuestionLoops(spec);
  const answeredQuestions = botQuestions.filter(
    (question) => question.type !== "info",
  );
  return Response.json({
    typebotId: savedTypebot.id,
    typebotName: savedTypebot.name,
    isNewBot,
    reply: buildAssistantReply({
      isNewBot,
      questionCount: answeredQuestions.length,
      filterCount: botQuestions.filter((question) => question.showIf).length,
      screenOutCount: botQuestions.filter((question) => question.terminateIf)
        .length,
    }),
    notes: [...spec.notes, ...warnings],
    questions: spec.questions.map((question) => ({
      code: question.code,
      type: question.type,
      text: question.text,
    })),
    spec,
  });
};

const generateQuestionnaireSpec = async ({
  models,
  message,
  documents,
  previousSpec,
}: {
  models: LanguageModel[];
  message: string;
  documents: z.infer<typeof requestSchema>["documents"];
  previousSpec: QuestionnaireSpec | undefined;
}) => {
  const content: UserContent = [];
  if (previousSpec)
    content.push({
      type: "text",
      text: `CURRENT QUESTIONNAIRE (previous version, JSON):\n${JSON.stringify(previousSpec)}`,
    });
  for (const document of documents)
    content.push(
      document.kind === "text"
        ? {
            type: "text",
            text: `ATTACHED DOCUMENT "${document.fileName}":\n${document.text}`,
          }
        : {
            type: "file",
            data: document.base64,
            mediaType: "application/pdf",
            filename: document.fileName,
          },
    );
  content.push({
    type: "text",
    text: `RESEARCHER'S REQUEST:\n${message.trim() || (previousSpec ? "Apply the attached changes." : "Script this questionnaire.")}`,
  });

  let lastError: unknown;
  for (const model of models) {
    try {
      const { object } = await generateObject({
        model,
        schema: questionnaireSpecGenerationSchema,
        system: questionnaireAssistantSystemPrompt,
        messages: [{ role: "user", content }],
        // Strict structured outputs: OpenAI always returns every field.
        providerOptions: { openai: { strictJsonSchema: true } },
        maxRetries: 1,
      });
      return object;
    } catch (error) {
      lastError = error;
      // Another model only helps when this one doesn't exist for the account.
      if (!/model|not found|does not exist|access/i.test(errorMessage(error)))
        throw error;
    }
  }
  throw lastError;
};

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/** Short, readable reason for the chat (which fields the AI got wrong). */
const describeGenerationError = (error: unknown) => {
  if (!NoObjectGeneratedError.isInstance(error)) return errorMessage(error);
  const validationError =
    error.cause instanceof Error ? error.cause.cause : undefined;
  const issues =
    validationError instanceof z.ZodError
      ? validationError.issues
          .slice(0, 3)
          .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
          .join("; ")
      : undefined;
  console.error(
    "Questionnaire assistant output",
    error.finishReason,
    error.text?.slice(0, 4000),
  );
  return [
    error.message,
    error.finishReason === "length"
      ? "The questionnaire is too long for one answer."
      : undefined,
    issues,
  ]
    .filter(Boolean)
    .join(" ");
};

const errorResponse = (status: number, error: string, details?: string) =>
  Response.json({ error, details }, { status });
