import { ORPCError } from "@orpc/server";
import { InputBlockType } from "@typebot.io/blocks-inputs/constants";
import { env } from "@typebot.io/env";
import { parseGroups } from "@typebot.io/groups/helpers/parseGroups";
import prisma from "@typebot.io/prisma";
import { Plan } from "@typebot.io/prisma/enum";
import type { Prisma as PrismaTypes } from "@typebot.io/prisma/types";
import { computeRiskLevel } from "@typebot.io/radar/computeRiskLevel";
import { detectTrademarkInfrigement } from "@typebot.io/radar/detectTrademarkInfrigement";
import { validateResearchStructure } from "@typebot.io/results/research/validateResearchStructure";
import {
  deleteSessionStore,
  getSessionStore,
} from "@typebot.io/runtime-session-store";
import { isTypebotVersionAtLeastV6 } from "@typebot.io/schemas/helpers/isTypebotVersionAtLeastV6";
import { settingsSchema } from "@typebot.io/settings/schemas";
import type { TelemetryEvent } from "@typebot.io/telemetry/schemas";
import { sendMessage } from "@typebot.io/telemetry/sendMessage";
import { trackEvents } from "@typebot.io/telemetry/trackEvents";
import { themeSchema } from "@typebot.io/theme/schemas";
import { edgeSchema } from "@typebot.io/typebot/schemas/edge";
import { publicTypebotSchemaV6 } from "@typebot.io/typebot/schemas/publicTypebot";
import { typebotV6Schema } from "@typebot.io/typebot/schemas/typebot";
import type { User } from "@typebot.io/user/schemas";
import { variableSchema } from "@typebot.io/variables/schemas";
import { z } from "zod";
import { parseTypebotPublishEvents } from "@/features/telemetry/helpers/parseTypebotPublishEvents";
import { isWriteTypebotForbidden } from "../helpers/isWriteTypebotForbidden";
import { publishNewVersion } from "../helpers/publishNewVersion";

const warningSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("trademarkInfringement"),
    trademark: z.string(),
  }),
  z.object({
    type: z.literal("researchStructure"),
    code: z.enum([
      "duplicateVariableName",
      "variableSharedByInputBlocks",
      "inputBlockWithoutVariable",
    ]),
    message: z.string(),
    variableName: z.string().optional(),
    blockId: z.string().optional(),
    blockIds: z.array(z.string()).optional(),
    groupTitle: z.string().optional(),
  }),
]);
type Warning = z.infer<typeof warningSchema>;

export const publishTypebotInputSchema = z.object({
  typebotId: z
    .string()
    .describe(
      "[Where to find my bot's ID?](../how-to#how-to-find-my-typebotid)",
    ),
});

export { warningSchema };

export const handlePublishTypebot = async ({
  input: { typebotId },
  context: { user },
}: {
  input: z.infer<typeof publishTypebotInputSchema>;
  context: { user: Pick<User, "id"> };
}) => {
  const warnings: Warning[] = [];

  const existingTypebot = await prisma.typebot.findFirst({
    where: {
      id: typebotId,
    },
    include: {
      collaborators: true,
      publishedTypebot: true,
      workspace: {
        select: {
          plan: true,
          isVerified: true,
          isSuspended: true,
          isPastDue: true,
          members: {
            select: {
              userId: true,
              role: true,
            },
          },
        },
      },
    },
  });
  if (
    !existingTypebot?.id ||
    (await isWriteTypebotForbidden(existingTypebot, user))
  )
    throw new ORPCError("NOT_FOUND", { message: "Typebot not found" });

  const hasFileUploadBlocks = parseGroups(existingTypebot.groups, {
    typebotVersion: existingTypebot.version,
  }).some((group) =>
    group.blocks.some((block) => block.type === InputBlockType.FILE),
  );

  if (hasFileUploadBlocks && existingTypebot.workspace.plan === Plan.FREE)
    throw new ORPCError("BAD_REQUEST", {
      message: "File upload blocks can't be published on the free plan",
    });

  const typebotWasVerified =
    existingTypebot.riskLevel === -1 || existingTypebot.workspace.isVerified;

  if (
    !typebotWasVerified &&
    existingTypebot.riskLevel &&
    existingTypebot.riskLevel > 80
  )
    throw new ORPCError("FORBIDDEN", {
      message:
        "Radar detected a potential malicious typebot. This bot is being manually reviewed by Fraud Prevention team.",
    });

  const sessionStore = getSessionStore(typebotId);
  const riskLevel = typebotWasVerified
    ? 0
    : await computeRiskLevel(typebotV6Schema.parse(existingTypebot), {
        sessionStore,
        debug: env.NODE_ENV === "development",
      });
  deleteSessionStore(typebotId);

  if (riskLevel > 0 && riskLevel !== existingTypebot.riskLevel) {
    if (riskLevel !== 100 && riskLevel > 60)
      await sendMessage(
        `⚠️ Suspicious typebot to be reviewed: ${existingTypebot.name} (${env.NEXTAUTH_URL}/typebots/${existingTypebot.id}/edit) (workspace: ${existingTypebot.workspaceId})`,
      );

    await prisma.typebot.updateMany({
      where: {
        id: existingTypebot.id,
      },
      data: {
        riskLevel,
      },
    });
    if (riskLevel > 80) {
      if (existingTypebot.publishedTypebot)
        await prisma.publicTypebot.deleteMany({
          where: {
            id: existingTypebot.publishedTypebot.id,
          },
        });
      throw new ORPCError("FORBIDDEN", {
        message:
          "Radar detected a potential malicious typebot. This bot is being manually reviewed by Fraud Prevention team.",
      });
    }
  }

  if (!typebotWasVerified) {
    const newMetadata = existingTypebot.settings
      ? settingsSchema.parse(existingTypebot.settings).metadata
      : undefined;
    const publishedMetadata = existingTypebot.publishedTypebot
      ? settingsSchema.parse(existingTypebot.publishedTypebot.settings).metadata
      : undefined;

    if (
      newMetadata?.title !== publishedMetadata?.title ||
      newMetadata?.description !== publishedMetadata?.description
    ) {
      const detectedTrademark = detectTrademarkInfrigement(newMetadata);
      if (detectedTrademark) {
        warnings.push({
          type: "trademarkInfringement",
          trademark: detectedTrademark,
        });
      }
    }
  }

  const publishEvents: TelemetryEvent[] = await parseTypebotPublishEvents({
    existingTypebot,
    userId: user.id,
    hasFileUploadBlocks,
  });

  const publishedSnapshot = parsePublishedSnapshot(existingTypebot);

  warnings.push(
    ...validateResearchStructure({
      groups: publishedSnapshot.groups,
      variables: publishedSnapshot.variables,
    }).map((warning) => ({
      type: "researchStructure" as const,
      ...warning,
    })),
  );

  const publishedVersion = await publishNewVersion({
    typebotId: existingTypebot.id,
    schemaVersion: existingTypebot.version,
    publishedById: user.id,
    publishedTypebotId: existingTypebot.publishedTypebot?.id,
    snapshot: publishedSnapshot,
  });

  if (!existingTypebot.publishedTypebot)
    publishEvents.push({
      name: "Typebot published",
      workspaceId: existingTypebot.workspaceId,
      typebotId: existingTypebot.id,
      userId: user.id,
      data: {
        isFirstPublish: existingTypebot.publishedTypebot ? undefined : true,
      },
    });

  await trackEvents(publishEvents);

  return {
    message: "success" as const,
    publishedVersion,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
};

const parsePublishedSnapshot = (
  typebot: Pick<
    PrismaTypes.Typebot,
    | "edges"
    | "groups"
    | "version"
    | "events"
    | "settings"
    | "variables"
    | "theme"
  >,
) => ({
  edges: z.array(edgeSchema).parse(typebot.edges),
  groups: parseGroups(typebot.groups, {
    typebotVersion: typebot.version,
  }),
  events:
    (isTypebotVersionAtLeastV6(typebot.version)
      ? publicTypebotSchemaV6.shape.events
      : z.null()
    ).parse(typebot.events) ?? undefined,
  settings: settingsSchema.parse(typebot.settings),
  variables: z.array(variableSchema).parse(typebot.variables),
  theme: themeSchema.parse(typebot.theme),
});
