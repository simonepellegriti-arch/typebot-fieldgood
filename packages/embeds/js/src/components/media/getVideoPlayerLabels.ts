export type VideoPlayerLabels = Record<
  | "play"
  | "pause"
  | "replay"
  | "mute"
  | "unmute"
  | "loading"
  | "buffering"
  | "error"
  | "retry",
  string
>;

const labels: Record<"en" | "it", VideoPlayerLabels> = {
  en: {
    play: "Play",
    pause: "Pause",
    replay: "Replay",
    mute: "Mute",
    unmute: "Unmute",
    loading: "Loading video…",
    buffering: "Slow connection, the video is loading…",
    error: "The video can't be played right now.",
    retry: "Retry",
  },
  it: {
    play: "Riproduci",
    pause: "Pausa",
    replay: "Riguarda",
    mute: "Disattiva audio",
    unmute: "Attiva audio",
    loading: "Caricamento del video…",
    buffering: "Connessione lenta, il video si sta caricando…",
    error: "Il video non può essere riprodotto in questo momento.",
    retry: "Riprova",
  },
};

/** Player texts in the respondent's language (Italian or English). */
export const getVideoPlayerLabels = (
  language: string | undefined = typeof navigator !== "undefined"
    ? navigator.language
    : undefined,
): VideoPlayerLabels =>
  language?.toLowerCase().startsWith("it") ? labels.it : labels.en;
