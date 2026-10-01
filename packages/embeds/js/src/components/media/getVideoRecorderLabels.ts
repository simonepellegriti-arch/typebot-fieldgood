export type VideoRecorderLabels = Record<
  | "record"
  | "stop"
  | "retake"
  | "send"
  | "cancel"
  | "openCamera"
  | "requesting"
  | "permissionDenied"
  | "unsupported"
  | "tooLarge"
  | "uploading"
  | "remaining",
  string
>;

const labels: Record<"en" | "it", VideoRecorderLabels> = {
  en: {
    record: "Start recording",
    stop: "Stop",
    retake: "Record again",
    send: "Send video",
    cancel: "Cancel",
    openCamera: "Answer with a video",
    requesting: "Allow access to the camera and microphone…",
    permissionDenied:
      "Camera or microphone not available. Check the browser permissions or answer in writing.",
    unsupported:
      "This browser can't record videos. Answer in writing or with a voice message.",
    tooLarge: "The video is too large: record a shorter answer.",
    uploading: "Sending the video…",
    remaining: "left",
  },
  it: {
    record: "Avvia registrazione",
    stop: "Stop",
    retake: "Registra di nuovo",
    send: "Invia video",
    cancel: "Annulla",
    openCamera: "Rispondi con un video",
    requesting: "Consenti l'accesso a fotocamera e microfono…",
    permissionDenied:
      "Fotocamera o microfono non disponibili. Controlla i permessi del browser oppure rispondi per iscritto.",
    unsupported:
      "Questo browser non può registrare video. Rispondi per iscritto o con un vocale.",
    tooLarge: "Il video è troppo pesante: registra una risposta più breve.",
    uploading: "Invio del video…",
    remaining: "rimanenti",
  },
};

/** Recorder texts in the respondent's language (Italian or English). */
export const getVideoRecorderLabels = (
  language: string | undefined = typeof navigator !== "undefined"
    ? navigator.language
    : undefined,
): VideoRecorderLabels =>
  language?.toLowerCase().startsWith("it") ? labels.it : labels.en;
