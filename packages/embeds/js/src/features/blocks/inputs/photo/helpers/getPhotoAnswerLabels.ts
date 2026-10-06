export type PhotoAnswerLabels = Record<
  | "takePhoto"
  | "takeAnother"
  | "retake"
  | "shutter"
  | "switchCamera"
  | "chooseFromGallery"
  | "openPhoneCamera"
  | "cancel"
  | "remove"
  | "openPhoto"
  | "requesting"
  | "permissionDenied"
  | "counter"
  | "maxReached"
  | "processing"
  | "uploading"
  | "wrongType"
  | "uploadFailed",
  string
>;

const labels: Record<"en" | "it", PhotoAnswerLabels> = {
  en: {
    takePhoto: "Take a photo",
    takeAnother: "Take another photo",
    retake: "Retake",
    shutter: "Take the photo",
    switchCamera: "Switch camera",
    chooseFromGallery: "Choose from gallery",
    openPhoneCamera: "Open the phone camera",
    cancel: "Cancel",
    remove: "Remove photo",
    openPhoto: "Open photo",
    requesting: "Allow access to the camera…",
    permissionDenied:
      "Camera not available. Check the browser permissions or open the phone camera.",
    counter: "{count} of {max} photos",
    maxReached: "You can send up to {max} photos.",
    processing: "Preparing the photo…",
    uploading: "Sending…",
    wrongType: "Choose a photo (JPEG, PNG, HEIC…).",
    uploadFailed: "The photos could not be sent. Try again.",
  },
  it: {
    takePhoto: "Scatta foto",
    takeAnother: "Scatta un'altra foto",
    retake: "Rifai",
    shutter: "Scatta",
    switchCamera: "Cambia fotocamera",
    chooseFromGallery: "Scegli dalla galleria",
    openPhoneCamera: "Apri la fotocamera del telefono",
    cancel: "Annulla",
    remove: "Rimuovi foto",
    openPhoto: "Apri foto",
    requesting: "Consenti l'accesso alla fotocamera…",
    permissionDenied:
      "Fotocamera non disponibile. Controlla i permessi del browser oppure apri la fotocamera del telefono.",
    counter: "{count} di {max} foto",
    maxReached: "Puoi inviare al massimo {max} foto.",
    processing: "Preparazione della foto…",
    uploading: "Invio in corso…",
    wrongType: "Scegli una foto (JPEG, PNG, HEIC…).",
    uploadFailed: "Non è stato possibile inviare le foto. Riprova.",
  },
};

/** Texts of the photo answer controls in the respondent's language (Italian or English). */
export const getPhotoAnswerLabels = (
  language: string | undefined = typeof navigator !== "undefined"
    ? navigator.language
    : undefined,
): PhotoAnswerLabels =>
  language?.toLowerCase().startsWith("it") ? labels.it : labels.en;
