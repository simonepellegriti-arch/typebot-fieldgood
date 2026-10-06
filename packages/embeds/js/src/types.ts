import type {
  ContinueChatResponse,
  StartChatResponse,
  StructuredReply,
} from "@typebot.io/chat-api/schemas";

export type BotContext = {
  typebot: StartChatResponse["typebot"];
  resultId?: string;
  isPreview: boolean;
  apiHost?: string;
  wsHost?: string;
  sessionId: string;
  previewWebhookRoom?: string;
  storage: "local" | "session" | undefined;
};

export type ClientSideActionContext = {
  apiHost?: string;
  wsHost?: string;
  sessionId: string;
  previewWebhookRoom?: string;
  resultId?: string;
  isPreview: boolean;
};

export type ChatChunk = Pick<
  ContinueChatResponse,
  "messages" | "clientSideActions" | "dynamicTheme"
> & {
  version: "2";
  input?: NonNullable<ContinueChatResponse["input"]> & {
    answer?: InputSubmitContent;
    isHidden?: boolean;
  };
  streamingMessage?: string | string[];
};

export type Attachment = {
  type: string;
  url: string;
  blobUrl?: string;
};

export type TextInputSubmitContent = {
  type: "text";
  value: string;
  label?: string;
  /** Research answer (matrix, "Other, please specify", tracked video) sent next to `value`. */
  structuredReply?: StructuredReply;
  metadata?: {
    replyId?: string;
  };
  attachments?: Attachment[];
  /** Image shown in the respondent's bubble only (e.g. the signature drawn). */
  previewImageUrl?: string;
  /** Images shown in the respondent's bubble only (e.g. the photos taken). */
  previewImageUrls?: string[];
};

export type RecordingInputSubmitContent = {
  type: "recording";
  url: string;
  blobUrl?: string;
  /** Voice message (default) or video answer. */
  mediaType?: "audio" | "video";
};

export type ClientSideResult = {
  type: "clientSideResult";
  result: string;
};

export type InputSubmitContent = { status?: "retry" } & (
  | TextInputSubmitContent
  | RecordingInputSubmitContent
);
