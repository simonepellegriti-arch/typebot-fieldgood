const italianTu = {
  send: "Invia",
  continue: "Continua",
  replay: "🔁 Rivedi il video",
  typeAnswer: "Scrivi la tua risposta…",
  typeOrSpeak: "Scrivi qui o tocca il microfono…",
  typeNumber: "Scrivi un numero…",
  closing: "Grazie per aver partecipato!",
  screenOut:
    "Grazie per il tuo tempo. In base alle tue risposte, l'intervista termina qui.",
  thinking: "Un attimo di pazienza…",
  wrongLink:
    "⚠️ Devi utilizzare il link che hai ricevuto. Riapri la chat dal link, grazie.",
  privacyIntro: "Prima di cominciare… 👋",
  privacyText: "INFORMATIVA PRIVACY\nPrendi visione del documento e procedi.",
  privacyAccept: "✅ Ho preso visione",
  voiceTestIntro:
    '🎤 Facciamo una prova del microfono. Tocca il microfono e leggi questa frase: "Giallo, rosso, verde, azzurro, bianco, nero."\nSe il microfono non funziona, scrivi qualsiasi cosa: potrai rispondere scrivendo.',
  voiceTestTranscript: "Trascrizione: «{{transcript}}»",
  voiceTestOk: "✅ Microfono ok, cominciamo",
  voiceTestWritten:
    "Nessun problema: potrai rispondere anche scrivendo. Cominciamo!",
  pause:
    "Perfetto 👍 Quando sarai pronto, riapri questo link e riprendiamo da dove eravamo rimasti.",
  photoChoice: "📷 Carico una foto",
  describeChoice: "✍️ Preferisco descriverli",
  photoPrompt: "Scatta la foto o sceglila dalla galleria 📷",
  checkingPhoto: "Un attimo, guardo la foto… 👀",
  photoNotRecognized:
    "Dalla foto non riesco a riconoscere quello che ti ho chiesto. Puoi riprovare con un'altra foto oppure descriverli a parole.",
  retryPhoto: "📷 Riprovo con un'altra foto",
  describePrompt:
    "Va benissimo! Scrivimi o dimmi a voce quali sono: nome e, se lo ricordi, il formato.",
  resumeReady: "▶️ Sono pronto, riprendiamo",
};

const italianLei: typeof italianTu = {
  ...italianTu,
  typeAnswer: "Scriva la sua risposta…",
  typeOrSpeak: "Scriva qui o tocchi il microfono…",
  typeNumber: "Scriva un numero…",
  closing: "La ringraziamo per aver partecipato!",
  screenOut:
    "La ringraziamo per il suo tempo. In base alle sue risposte, l'intervista termina qui.",
  wrongLink:
    "⚠️ Deve utilizzare il link che ha ricevuto. Riapra la chat dal link, grazie.",
  privacyText: "INFORMATIVA PRIVACY\nPrenda visione del documento e proceda.",
  voiceTestIntro:
    '🎤 Facciamo una prova del microfono. Tocchi il microfono e legga questa frase: "Giallo, rosso, verde, azzurro, bianco, nero."\nSe il microfono non funziona, scriva qualsiasi cosa: potrà rispondere scrivendo.',
  voiceTestWritten:
    "Nessun problema: potrà rispondere anche scrivendo. Cominciamo!",
  pause:
    "Perfetto 👍 Quando sarà pronto, riapra questo link e riprenderemo da dove eravamo rimasti.",
  photoChoice: "📷 Carico una foto",
  describeChoice: "✍️ Preferisco descriverli",
  photoPrompt: "Scatti la foto o la scelga dalla galleria 📷",
  checkingPhoto: "Un attimo, guardo la foto… 👀",
  photoNotRecognized:
    "Dalla foto non riesco a riconoscere quello che le ho chiesto. Può riprovare con un'altra foto oppure descriverli a parole.",
  retryPhoto: "📷 Riprovo con un'altra foto",
  describePrompt:
    "Va benissimo! Mi scriva o mi dica a voce quali sono: nome e, se lo ricorda, il formato.",
  resumeReady: "▶️ Sono pronto, riprendiamo",
};

const english: typeof italianTu = {
  send: "Send",
  continue: "Continue",
  replay: "🔁 Watch it again",
  typeAnswer: "Type your answer…",
  typeOrSpeak: "Type here or tap the microphone…",
  typeNumber: "Type a number…",
  closing: "Thank you for taking part!",
  screenOut:
    "Thank you for your time. Based on your answers, the interview ends here.",
  thinking: "Just a moment…",
  wrongLink:
    "⚠️ Please use the link you received. Open the chat again from that link, thank you.",
  privacyIntro: "Before we start… 👋",
  privacyText: "PRIVACY NOTICE\nPlease read the document and continue.",
  privacyAccept: "✅ I have read it",
  voiceTestIntro:
    "🎤 Let's test the microphone. Tap the microphone and read this sentence: \"Yellow, red, green, blue, white, black.\"\nIf the microphone doesn't work, type anything: you can answer in writing.",
  voiceTestTranscript: "Transcript: «{{transcript}}»",
  voiceTestOk: "✅ Microphone OK, let's start",
  voiceTestWritten: "No problem: you can also answer in writing. Let's start!",
  pause:
    "Great 👍 When you're ready, open this link again and we'll pick up where we left off.",
  photoChoice: "📷 I'll upload a photo",
  describeChoice: "✍️ I'd rather describe them",
  photoPrompt: "Take the photo or pick it from your gallery 📷",
  checkingPhoto: "Just a moment, I'm looking at the photo… 👀",
  photoNotRecognized:
    "I can't recognize what I asked for in the photo. You can try another photo or describe them in words.",
  retryPhoto: "📷 Try another photo",
  describePrompt:
    "That's fine! Write or tell me which ones: name and, if you remember, the format.",
  resumeReady: "▶️ I'm ready, let's go on",
};

/** Buttons and default messages of generated bots, in the questionnaire language and register. */
export const getBotLabels = (
  language: string,
  addressForm: "tu" | "lei" = "tu",
) => {
  if (!language.toLowerCase().startsWith("it")) return english;
  return addressForm === "lei" ? italianLei : italianTu;
};

export type BotLabels = ReturnType<typeof getBotLabels>;
