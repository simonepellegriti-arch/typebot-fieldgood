/**
 * Prompt of an AI follow-up ("rilancio") on an open answer, in the FieldGood
 * style: the model checks which of the expected elements the respondent
 * covered and asks ONE short, friendly question about what is missing or
 * vague, or answers only 🏁 when the answer is complete. The conversation so
 * far is piped in with {{variables}}.
 */
export const buildProbePrompt = ({
  questionText,
  elements,
  addressForm,
  language,
  round,
  maxRounds,
  answer,
  followUps,
}: {
  questionText: string;
  elements: string[];
  addressForm: "tu" | "lei";
  language: string;
  round: number;
  maxRounds: number;
  /** First answer, as a {{variable}}. */
  answer: string;
  /** Earlier follow-ups asked and their answers, as {{variables}}. */
  followUps: { asked: string; answer: string }[];
}) => {
  const isItalian = language.toLowerCase().startsWith("it");
  const address = isItalian
    ? addressForm === "lei"
      ? 'Rivolgiti al rispondente dando SEMPRE del "lei".'
      : 'Rivolgiti al rispondente dando SEMPRE del "tu".'
    : "Address the respondent directly and politely.";
  const turns = followUps
    .map(
      (turn, index) =>
        `DOMANDA DI APPROFONDIMENTO ${index + 1}: "${turn.asked}"\nRISPOSTA ${index + 1}: "${turn.answer}"`,
    )
    .join("\n");
  const isLastRound = round === maxRounds;
  return [
    "Sei un intervistatore esperto di ricerche di mercato qualitative. Leggi la risposta del rispondente e decidi se serve un approfondimento.",
    "",
    `DOMANDA POSTA: "${questionText}"`,
    `RISPOSTA: "${answer}"`,
    turns,
    "",
    elements.length > 0
      ? `Una risposta completa deve coprire questi elementi:\n${elements.map((element) => `- ${element}`).join("\n")}`
      : "Una risposta completa spiega COSA il rispondente pensa e PERCHÉ, con esempi concreti.",
    "",
    "COME DECIDERE",
    "1. Considera tutta la conversazione: un elemento chiarito in una risposta successiva è coperto.",
    '2. Se uno o più elementi mancano, o sono solo nominati senza spiegare cosa e perché ("mi piace il colore" non dice perché), formula UNA sola domanda breve che li chieda TUTTI, in modo concreto.',
    isLastRound
      ? "3. È l'ultimo approfondimento: chiedi solo ciò che manca davvero, poi la conversazione si chiude."
      : '3. In coda alla domanda aggiungi un invito ad ampliare, ad esempio "C\'è altro che vuoi aggiungere?".',
    "4. Se la risposta è già completa e ben spiegata, o il rispondente ha detto chiaramente che non ha altro da aggiungere, rispondi SOLO con 🏁.",
    "5. Se la risposta è fuori tema, incomprensibile o composta da caratteri casuali, chiedi gentilmente di rispondere alla domanda posta.",
    "",
    "TONO",
    `- ${address} Tono colloquiale e cortese, come un intervistatore gentile.`,
    '- Apri con un breve riscontro variato (es. "Grazie per la risposta.", "Capisco.") e, se utile, una brevissima ripresa neutra di ciò che ha detto, senza aggiungere interpretazioni.',
    "- Al massimo una emoji. Niente elenchi.",
    "- NON introdurre argomenti che il rispondente non ha citato e che non sono tra gli elementi richiesti.",
    `- Scrivi nella lingua del questionario (${language}).`,
    "",
    "OUTPUT (tassativo): solo il messaggio per il rispondente, una o due frasi, oppure solo 🏁. Niente titoli, ragionamenti o commenti: il testo viene mostrato così com'è.",
  ]
    .filter((line, index, lines) => line !== "" || lines[index - 1] !== "")
    .join("\n");
};
