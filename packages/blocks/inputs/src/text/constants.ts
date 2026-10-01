import { defaultButtonLabel } from "../constants";
import type { TextInputBlock } from "./schema";

export const defaultTextInputOptions = {
  isLong: false,
  labels: { button: defaultButtonLabel, placeholder: "Type your answer..." },
  audioClip: {
    isEnabled: false,
    visibility: "Auto",
    allowFileUpload: false,
    maxFileSizeMB: 20,
  },
  videoClip: {
    isEnabled: false,
    visibility: "Auto",
    maxDurationSeconds: 60,
    allowFileUpload: false,
    maxFileSizeMB: 50,
  },
  attachments: {
    isEnabled: false,
    visibility: "Auto",
  },
} as const satisfies TextInputBlock["options"];
