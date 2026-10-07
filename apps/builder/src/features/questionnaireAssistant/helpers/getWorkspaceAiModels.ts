import { decrypt } from "@typebot.io/credentials/decrypt";
import { forgedBlocks } from "@typebot.io/forge-repository/definitions";
import prisma from "@typebot.io/prisma";
import type { LanguageModel } from "ai";
import { z } from "zod";

/**
 * AI models of the workspace credentials, OpenAI first then Anthropic, in the
 * given order of preference (callers try them until one works).
 */
export const getWorkspaceAiModels = async (
  workspaceId: string,
  modelIdsByProvider: Record<"openai" | "anthropic", readonly string[]>,
) => {
  const credentials = await prisma.credentials.findMany({
    where: { workspaceId, type: { in: ["openai", "anthropic"] } },
    orderBy: { createdAt: "desc" },
    select: { id: true, type: true, data: true, iv: true },
  });
  const models: LanguageModel[] = [];
  let openAiCredentialsId: string | undefined;
  for (const type of ["openai", "anthropic"] as const) {
    const credential = credentials.find((candidate) => candidate.type === type);
    if (!credential) continue;
    const parsedData = aiCredentialsSchema.safeParse(
      await decrypt(credential.data, credential.iv).catch(() => undefined),
    );
    if (!parsedData.success) continue;
    // Voice transcriptions and AI follow-ups of the generated bots use it.
    if (type === "openai") openAiCredentialsId = credential.id;
    const getModel = forgedBlocks[type].actions.find(
      (action) => action.aiGenerate,
    )?.aiGenerate?.getModel;
    if (!getModel) continue;
    for (const modelId of modelIdsByProvider[type])
      models.push(
        getModel({
          credentials: { apiKey: parsedData.data.apiKey },
          model: modelId,
        }),
      );
  }
  return { models, openAiCredentialsId };
};

const aiCredentialsSchema = z.object({
  apiKey: z.string().min(1),
});
