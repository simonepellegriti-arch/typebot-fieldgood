import { beforeEach, describe, expect, it, mock } from "bun:test";
import { InputBlockType } from "@typebot.io/blocks-inputs/constants";

process.env.DATABASE_URL = "postgres://user:password@localhost:5432/typebot";
process.env.ENCRYPTION_SECRET = "12345678901234567890123456789012";
process.env.NEXTAUTH_URL = "http://localhost:3000";
process.env.NEXT_PUBLIC_VIEWER_URL = "http://localhost:3001";
process.env.S3_ACCESS_KEY = "minio";
process.env.S3_BUCKET = "typebot";
process.env.S3_ENDPOINT = "s3.example.com";
process.env.S3_SECRET_KEY = "miniostorage";
process.env.SKIP_ENV_CHECK = "false";

const getSessionMock = mock();
const publicTypebotFindFirstMock = mock();

mock.module("@typebot.io/chat-session/queries/getSession", () => ({
  getSession: getSessionMock,
}));

mock.module("@typebot.io/prisma", () => ({
  default: {
    publicTypebot: {
      findFirst: publicTypebotFindFirstMock,
    },
  },
}));

const { handleGenerateUploadUrl } = await import("./handleGenerateUploadUrl");

const blockIdFromSession = "block-session";
const resultIdFromSession = "result-session";
const sessionId = "session-id";
const typebotIdFromSession = "typebot-session";
const workspaceIdFromPublicTypebot = "workspace-session";

describe("handleGenerateUploadUrl", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    publicTypebotFindFirstMock.mockReset();
    getSessionMock.mockResolvedValue(buildSession());
    publicTypebotFindFirstMock.mockResolvedValue(buildPublicTypebot());
  });

  it("uses the session block for current uploads", async () => {
    const response = await handleGenerateUploadUrl({
      input: {
        sessionId,
        blockId: "block-request",
        fileName: "file.png",
        fileType: "image/png",
        fileSize: 1024,
      },
      context: { apiOrigin: "http://localhost:3001" },
    });

    const filePath = parseSignedUploadFilePath(response.presignedUrl);

    expect(filePath.startsWith(expectedCurrentResultPrefix())).toBe(true);
    expect(filePath.includes("block-request")).toBe(false);
    expect(filePath.endsWith(".png")).toBe(true);
    expect(response.fileUrl.startsWith(expectedCurrentPrivateFileUrl())).toBe(
      true,
    );
    expect(response.maxFileSize).toBe(5);
  });

  it("keeps enforcing an extension-based image allowlist for captured files", async () => {
    publicTypebotFindFirstMock.mockResolvedValue(
      buildPublicTypebot([".JPG", ".png", ".jpeg"]),
    );

    const response = await handleGenerateUploadUrl({
      input: {
        sessionId,
        blockId: blockIdFromSession,
        fileName: "captured-image.jpg",
        fileType: "image/jpeg",
      },
      context: { apiOrigin: "http://localhost:3001" },
    });

    expect(
      parseSignedUploadFilePath(response.presignedUrl).endsWith(".jpeg"),
    ).toBe(true);
    await expect(
      handleGenerateUploadUrl({
        input: {
          sessionId,
          blockId: blockIdFromSession,
          fileName: "document.pdf",
          fileType: "application/pdf",
        },
        context: { apiOrigin: "http://localhost:3001" },
      }),
    ).rejects.toThrow("File type application/pdf not allowed");
  });

  it("fails closed when an enabled allowlist cannot be resolved", async () => {
    publicTypebotFindFirstMock.mockResolvedValue(
      buildPublicTypebot(["image/x-unknown"]),
    );

    await expect(
      handleGenerateUploadUrl({
        input: {
          sessionId,
          blockId: blockIdFromSession,
          fileName: "document.pdf",
          fileType: "application/pdf",
        },
        context: { apiOrigin: "http://localhost:3001" },
      }),
    ).rejects.toThrow("File type application/pdf not allowed");
  });
});

describe("voice / video answers of open questions", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    publicTypebotFindFirstMock.mockReset();
    getSessionMock.mockResolvedValue(buildSession());
  });

  const generateMediaUploadUrl = (input: {
    purpose: "audioClip" | "videoClip";
    fileType?: string;
    fileSize?: number;
  }) =>
    handleGenerateUploadUrl({
      input: {
        sessionId,
        blockId: blockIdFromSession,
        fileName: "answer",
        ...input,
      },
      context: { apiOrigin: "http://localhost:3001" },
    });

  it("signs a direct upload of the video with its type and size", async () => {
    publicTypebotFindFirstMock.mockResolvedValue(
      buildTextInputTypebot({
        videoClip: { isEnabled: true, visibility: "Public" },
      }),
    );
    const fileSize = 30 * 1024 * 1024;
    const response = await generateMediaUploadUrl({
      purpose: "videoClip",
      fileType: "video/quicktime",
      fileSize,
    });
    const presignedUrl = new URL(response.presignedUrl);
    expect(presignedUrl.host).toBe("s3.example.com");
    expect(
      presignedUrl.pathname.startsWith(
        `/typebot/public/workspaces/${workspaceIdFromPublicTypebot}/typebots/${typebotIdFromSession}/results/${resultIdFromSession}/blocks/${blockIdFromSession}/`,
      ),
    ).toBe(true);
    expect(presignedUrl.pathname.endsWith(".mov")).toBe(true);
    expect(presignedUrl.searchParams.get("X-Amz-SignedHeaders")).toBe(
      "cache-control;content-length;content-type;host",
    );
    expect(response.fileType).toBe("video/quicktime");
    expect(response.maxFileSize).toBe(50);
    expect(
      response.fileUrl.endsWith(presignedUrl.pathname.split("/").at(-1) ?? "-"),
    ).toBe(true);
  });

  it("refuses videos over the size limit of the question", async () => {
    publicTypebotFindFirstMock.mockResolvedValue(
      buildTextInputTypebot({
        videoClip: { isEnabled: true, maxFileSizeMB: 10 },
      }),
    );
    await expect(
      generateMediaUploadUrl({
        purpose: "videoClip",
        fileType: "video/mp4",
        fileSize: 11 * 1024 * 1024,
      }),
    ).rejects.toThrow("File size exceeds the 10MB limit");
    await expect(
      generateMediaUploadUrl({ purpose: "videoClip", fileType: "video/mp4" }),
    ).rejects.toThrow("Missing file size");
  });

  it("refuses files that are not videos", async () => {
    publicTypebotFindFirstMock.mockResolvedValue(
      buildTextInputTypebot({ videoClip: { isEnabled: true } }),
    );
    await expect(
      generateMediaUploadUrl({
        purpose: "videoClip",
        fileType: "text/html",
        fileSize: 1024,
      }),
    ).rejects.toThrow("File type text/html not allowed");
  });

  it("accepts audio files and keeps private answers behind the builder", async () => {
    publicTypebotFindFirstMock.mockResolvedValue(
      buildTextInputTypebot({
        audioClip: { isEnabled: true, visibility: "Private" },
      }),
    );
    const response = await generateMediaUploadUrl({
      purpose: "audioClip",
      fileType: "audio/mpeg",
      fileSize: 1024 * 1024,
    });
    expect(
      new URL(response.presignedUrl).pathname.startsWith("/typebot/private/"),
    ).toBe(true);
    expect(
      response.fileUrl.startsWith(
        `http://localhost:3000/api/typebots/${typebotIdFromSession}/results/${resultIdFromSession}/blocks/${blockIdFromSession}/`,
      ),
    ).toBe(true);
    expect(response.fileUrl.endsWith(".mp3")).toBe(true);
    await expect(
      generateMediaUploadUrl({
        purpose: "audioClip",
        fileType: "image/png",
        fileSize: 1024,
      }),
    ).rejects.toThrow("File type image/png not allowed");
  });

  it("refuses uploads when the open question allows no recording", async () => {
    publicTypebotFindFirstMock.mockResolvedValue(
      buildTextInputTypebot({ videoClip: { isEnabled: false } }),
    );
    await expect(
      generateMediaUploadUrl({
        purpose: "videoClip",
        fileType: "video/webm",
        fileSize: 1024,
      }),
    ).rejects.toThrow("Current block does not expect this kind of answer");
    await expect(
      handleGenerateUploadUrl({
        input: {
          sessionId,
          blockId: blockIdFromSession,
          fileName: "video-answer.webm",
          fileType: "video/webm",
          fileSize: 1024,
        },
        context: { apiOrigin: "http://localhost:3001" },
      }),
    ).rejects.toThrow("Current block does not expect file upload");
  });

  it("refuses media answers on file input blocks", async () => {
    publicTypebotFindFirstMock.mockResolvedValue(buildPublicTypebot());
    await expect(
      generateMediaUploadUrl({
        purpose: "videoClip",
        fileType: "video/mp4",
        fileSize: 1024,
      }),
    ).rejects.toThrow("Current block does not expect file upload");
  });
});

describe("signatures", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    publicTypebotFindFirstMock.mockReset();
    getSessionMock.mockResolvedValue(buildSession());
    publicTypebotFindFirstMock.mockResolvedValue({
      version: "6",
      groups: [
        {
          id: "group",
          title: "Group",
          graphCoordinates: { x: 0, y: 0 },
          blocks: [
            {
              id: blockIdFromSession,
              type: InputBlockType.SIGNATURE,
              options: { visibility: "Private" },
            },
          ],
        },
      ],
      typebot: { workspaceId: workspaceIdFromPublicTypebot },
    });
  });

  const generateSignatureUploadUrl = (input: {
    fileType?: string;
    fileSize?: number;
  }) =>
    handleGenerateUploadUrl({
      input: {
        sessionId,
        blockId: blockIdFromSession,
        fileName: "signature.jpg",
        ...input,
      },
      context: { apiOrigin: "http://localhost:3001" },
    });

  it("signs a direct upload of the JPEG with the block visibility", async () => {
    const response = await generateSignatureUploadUrl({
      fileType: "image/jpeg",
      fileSize: 40_000,
    });
    const presignedUrl = new URL(response.presignedUrl);
    expect(presignedUrl.pathname.startsWith("/typebot/private/")).toBe(true);
    expect(presignedUrl.pathname.endsWith(".jpeg")).toBe(true);
    expect(
      response.fileUrl.startsWith("http://localhost:3000/api/typebots/"),
    ).toBe(true);
  });

  it("refuses other file types and files over 2 MB", async () => {
    await expect(
      generateSignatureUploadUrl({ fileType: "image/png", fileSize: 1000 }),
    ).rejects.toThrow("File type image/png not allowed");
    await expect(
      generateSignatureUploadUrl({
        fileType: "image/jpeg",
        fileSize: 3 * 1024 * 1024,
      }),
    ).rejects.toThrow("File size exceeds the 2MB limit");
  });
});

describe("photos", () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    publicTypebotFindFirstMock.mockReset();
    getSessionMock.mockResolvedValue(buildSession());
    publicTypebotFindFirstMock.mockResolvedValue({
      version: "6",
      groups: [
        {
          id: "group",
          title: "Group",
          graphCoordinates: { x: 0, y: 0 },
          blocks: [
            {
              id: blockIdFromSession,
              type: InputBlockType.PHOTO,
              options: { maxPhotos: 3 },
            },
          ],
        },
      ],
      typebot: { workspaceId: workspaceIdFromPublicTypebot },
    });
  });

  const generatePhotoUploadUrl = (input: {
    fileType?: string;
    fileSize?: number;
  }) =>
    handleGenerateUploadUrl({
      input: {
        sessionId,
        blockId: blockIdFromSession,
        fileName: "photo.jpg",
        ...input,
      },
      context: { apiOrigin: "http://localhost:3001" },
    });

  it("signs a direct public upload of the JPEG by default", async () => {
    const response = await generatePhotoUploadUrl({
      fileType: "image/jpeg",
      fileSize: 900_000,
    });
    const presignedUrl = new URL(response.presignedUrl);
    expect(presignedUrl.pathname.startsWith("/typebot/public/")).toBe(true);
    expect(presignedUrl.pathname.endsWith(".jpeg")).toBe(true);
    expect(response.maxFileSize).toBe(5);
  });

  it("refuses other file types and files over 5 MB", async () => {
    await expect(
      generatePhotoUploadUrl({ fileType: "image/heic", fileSize: 1000 }),
    ).rejects.toThrow("File type image/heic not allowed");
    await expect(
      generatePhotoUploadUrl({
        fileType: "image/jpeg",
        fileSize: 6 * 1024 * 1024,
      }),
    ).rejects.toThrow("File size exceeds the 5MB limit");
  });
});

type MediaAnswerOptions = {
  isEnabled: boolean;
  visibility?: "Public" | "Private";
  maxFileSizeMB?: number;
};

const buildTextInputTypebot = (options: {
  audioClip?: MediaAnswerOptions;
  videoClip?: MediaAnswerOptions;
}) => ({
  version: "6",
  groups: [
    {
      id: "group",
      title: "Group",
      graphCoordinates: { x: 0, y: 0 },
      blocks: [
        {
          id: blockIdFromSession,
          type: InputBlockType.TEXT,
          options,
        },
      ],
    },
  ],
  typebot: { workspaceId: workspaceIdFromPublicTypebot },
});

const buildSession = () => ({
  state: {
    currentBlockId: blockIdFromSession,
    typebotsQueue: [
      {
        resultId: resultIdFromSession,
        typebot: {
          id: typebotIdFromSession,
        },
      },
    ],
  },
});

const buildPublicTypebot = (allowedFileTypes?: string[]) => ({
  version: "5",
  groups: [
    {
      id: "group",
      title: "Group",
      graphCoordinates: { x: 0, y: 0 },
      blocks: [
        {
          id: blockIdFromSession,
          type: InputBlockType.FILE,
          options: {
            visibility: "Private",
            sizeLimit: 5,
            capture: allowedFileTypes ? "environment" : undefined,
            allowedFileTypes: allowedFileTypes
              ? { isEnabled: true, types: allowedFileTypes }
              : undefined,
          },
        },
      ],
    },
  ],
  typebot: {
    workspaceId: workspaceIdFromPublicTypebot,
  },
});

const parseSignedUploadFilePath = (presignedUrl: string) => {
  const token = new URL(presignedUrl).pathname.split("/").at(-1);
  if (!token) throw new Error("Missing upload token");

  const encodedPayload = decodeURIComponent(token).split(".")[0];
  if (!encodedPayload) throw new Error("Missing upload payload");

  const payload: unknown = JSON.parse(
    Buffer.from(encodedPayload, "base64url").toString("utf8"),
  );

  if (
    typeof payload !== "object" ||
    payload === null ||
    !("filePath" in payload) ||
    typeof payload.filePath !== "string"
  )
    throw new Error("Invalid upload payload");

  return payload.filePath;
};

const expectedResultPrefix = () =>
  `private/workspaces/${workspaceIdFromPublicTypebot}/typebots/${typebotIdFromSession}/results/${resultIdFromSession}/`;

const expectedCurrentResultPrefix = () =>
  `${expectedResultPrefix()}blocks/${blockIdFromSession}/`;

const expectedPrivateFileUrl = () =>
  `${process.env.NEXTAUTH_URL}/api/typebots/${typebotIdFromSession}/results/${resultIdFromSession}/`;

const expectedCurrentPrivateFileUrl = () =>
  `${expectedPrivateFileUrl()}blocks/${blockIdFromSession}/`;
