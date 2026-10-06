const botLabels = {
  it: {
    send: "Invia",
    typeAnswer: "Scrivi la tua risposta…",
    typeNumber: "Scrivi un numero…",
    closing: "Grazie per aver partecipato!",
    screenOut:
      "Grazie per il tuo tempo. In base alle tue risposte, l'intervista termina qui.",
  },
  en: {
    send: "Send",
    typeAnswer: "Type your answer…",
    typeNumber: "Type a number…",
    closing: "Thank you for taking part!",
    screenOut:
      "Thank you for your time. Based on your answers, the interview ends here.",
  },
} as const;

/** Buttons and default messages of generated bots, in the questionnaire language. */
export const getBotLabels = (language: string) =>
  language.toLowerCase().startsWith("it") ? botLabels.it : botLabels.en;
