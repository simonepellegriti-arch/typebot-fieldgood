export type MediaAnswerLabels = Record<
  | "record"
  | "stop"
  | "retake"
  | "send"
  | "sendAudio"
  | "cancel"
  | "openCamera"
  | "uploadVideo"
  | "uploadAudio"
  | "chooseAnother"
  | "requesting"
  | "permissionDenied"
  | "permissionDeniedNoUpload"
  | "unsupported"
  | "unsupportedNoUpload"
  | "tooLarge"
  | "tooLong"
  | "wrongVideoType"
  | "wrongAudioType"
  | "uploading"
  | "remaining",
  string
>;

const labels: Record<"en" | "it", MediaAnswerLabels> = {
  en: {
    record: "Start recording",
    stop: "Stop",
    retake: "Record again",
    send: "Send video",
    sendAudio: "Send audio",
    cancel: "Cancel",
    openCamera: "Answer with a video",
    uploadVideo: "Upload a video",
    uploadAudio: "Upload an audio file",
    chooseAnother: "Choose another file",
    requesting: "Allow access to the camera and microphone…",
    permissionDenied:
      "Camera or microphone not available. Check the browser permissions, upload a video or answer in writing.",
    permissionDeniedNoUpload:
      "Camera or microphone not available. Check the browser permissions or answer in writing.",
    unsupported:
      "This browser can't record videos. Upload a video or answer in writing.",
    unsupportedNoUpload:
      "This browser can't record videos. Please answer in writing.",
    tooLarge: "The file is too large (maximum {size} MB).",
    tooLong: "The video is too long (maximum {duration}).",
    wrongVideoType: "Choose a video file.",
    wrongAudioType: "Choose an audio file.",
    uploading: "Sending…",
    remaining: "left",
  },
  it: {
    record: "Avvia registrazione",
    stop: "Stop",
    retake: "Registra di nuovo",
    send: "Invia video",
    sendAudio: "Invia audio",
    cancel: "Annulla",
    openCamera: "Rispondi con un video",
    uploadVideo: "Carica un video",
    uploadAudio: "Carica un file audio",
    chooseAnother: "Scegli un altro file",
    requesting: "Consenti l'accesso a fotocamera e microfono…",
    permissionDenied:
      "Fotocamera o microfono non disponibili. Controlla i permessi del browser, carica un video oppure rispondi per iscritto.",
    permissionDeniedNoUpload:
      "Fotocamera o microfono non disponibili. Controlla i permessi del browser oppure rispondi per iscritto.",
    unsupported:
      "Questo browser non può registrare video. Carica un video oppure rispondi per iscritto.",
    unsupportedNoUpload:
      "Questo browser non può registrare video. Rispondi per iscritto.",
    tooLarge: "Il file è troppo pesante (massimo {size} MB).",
    tooLong: "Il video è troppo lungo (massimo {duration}).",
    wrongVideoType: "Scegli un file video.",
    wrongAudioType: "Scegli un file audio.",
    uploading: "Invio in corso…",
    remaining: "rimanenti",
  },
};

/** Texts of the voice / video answer controls in the respondent's language (Italian or English). */
export const getMediaAnswerLabels = (
  language: string | undefined = typeof navigator !== "undefined"
    ? navigator.language
    : undefined,
): MediaAnswerLabels =>
  language?.toLowerCase().startsWith("it") ? labels.it : labels.en;
