import type { InputMessage } from "@typebot.io/chat-api/schemas";

/** Text of a reply, or the URL of the recorded audio / video answer. */
export const getReplyContent = (message: InputMessage) =>
  message.type === "text" ? message.text : message.url;
