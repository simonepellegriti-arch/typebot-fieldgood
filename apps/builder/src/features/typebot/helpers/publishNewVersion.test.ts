import { beforeEach, describe, expect, it, mock } from "bun:test";

process.env.SKIP_ENV_CHECK = "true";

type StoredVersion = {
  id: string;
  typebotId: string;
  versionNumber: number;
  publishedAt: Date;
  groups: unknown;
};

const storedVersions: StoredVersion[] = [];
const publicTypebotUpdateMany = mock();
const publicTypebotCreateMany = mock();

const transactionClient = {
  publicTypebotVersion: {
    findFirst: mock(async ({ where }: { where: { typebotId: string } }) => {
      const versions = storedVersions
        .filter((version) => version.typebotId === where.typebotId)
        .sort((a, b) => b.versionNumber - a.versionNumber);
      return versions[0] ? { versionNumber: versions[0].versionNumber } : null;
    }),
    create: mock(
      async ({ data }: { data: Omit<StoredVersion, "id" | "publishedAt"> }) => {
        const version = {
          ...data,
          id: `v_${data.versionNumber}`,
          publishedAt: new Date(),
        };
        storedVersions.push(version);
        return {
          id: version.id,
          versionNumber: version.versionNumber,
          publishedAt: version.publishedAt,
        };
      },
    ),
  },
  publicTypebot: {
    updateMany: publicTypebotUpdateMany,
    createMany: publicTypebotCreateMany,
  },
};

mock.module("@typebot.io/prisma", () => ({
  default: {
    $transaction: (callback: (client: typeof transactionClient) => unknown) =>
      callback(transactionClient),
  },
}));

const { publishNewVersion } = await import("./publishNewVersion");

const snapshot = (questionLabel: string) => ({
  edges: [],
  groups: [{ id: "g1", title: questionLabel, blocks: [] }],
  settings: {},
  variables: [],
  theme: {},
});

describe("publishNewVersion", () => {
  beforeEach(() => {
    storedVersions.length = 0;
    publicTypebotUpdateMany.mockReset();
    publicTypebotCreateMany.mockReset();
  });

  it("creates a new immutable version at every publish", async () => {
    const firstVersion = await publishNewVersion({
      typebotId: "typebot-1",
      schemaVersion: "6",
      publishedById: "user-1",
      publishedTypebotId: undefined,
      snapshot: snapshot("Quanto sei soddisfatto?"),
    });
    const secondVersion = await publishNewVersion({
      typebotId: "typebot-1",
      schemaVersion: "6",
      publishedById: "user-1",
      publishedTypebotId: "public-1",
      snapshot: snapshot("Quanto sei soddisfatto del servizio?"),
    });

    expect(firstVersion.versionNumber).toBe(1);
    expect(secondVersion.versionNumber).toBe(2);
    // version 1 is untouched by the second publish
    expect(storedVersions[0]!.groups).toEqual(
      snapshot("Quanto sei soddisfatto?").groups,
    );
    expect(publicTypebotCreateMany.mock.calls[0]![0].data).toMatchObject({
      typebotId: "typebot-1",
      currentVersionId: "v_1",
      currentVersionNumber: 1,
    });
    expect(publicTypebotUpdateMany.mock.calls[0]![0]).toMatchObject({
      where: { id: "public-1" },
      data: { currentVersionId: "v_2", currentVersionNumber: 2 },
    });
  });
});
