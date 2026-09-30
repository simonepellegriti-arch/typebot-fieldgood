export type VideoResumeState = {
  currentTime: number;
  maxReachedTime: number;
  watchedSeconds: number;
  watchedPercentage: number;
  isCompleted: boolean;
  isStarted: boolean;
  pauseCount: number;
};

/**
 * Remembers where a respondent was in a video (per browser tab) so that coming
 * back to it resumes playback and keeps what was already watched. Storage may be
 * unavailable (private mode, blocked cookies): everything degrades to "no resume".
 */
export const createVideoResumeStore = (
  key: string | undefined,
  storage:
    | Pick<Storage, "getItem" | "setItem">
    | undefined = getSessionStorage(),
) => ({
  read: (): VideoResumeState | undefined => {
    if (!key || !storage) return;
    try {
      const rawState = storage.getItem(`typebot-video:${key}`);
      if (!rawState) return;
      const parsedState: unknown = JSON.parse(rawState);
      return isResumeState(parsedState) ? parsedState : undefined;
    } catch {
      return;
    }
  },
  write: (state: VideoResumeState) => {
    if (!key || !storage) return;
    try {
      storage.setItem(`typebot-video:${key}`, JSON.stringify(state));
    } catch {
      // Quota exceeded or storage blocked: resume is a convenience only.
    }
  },
});

const getSessionStorage = () => {
  try {
    return typeof sessionStorage !== "undefined" ? sessionStorage : undefined;
  } catch {
    return;
  }
};

const isResumeState = (value: unknown): value is VideoResumeState =>
  typeof value === "object" &&
  value !== null &&
  "currentTime" in value &&
  typeof value.currentTime === "number" &&
  "maxReachedTime" in value &&
  typeof value.maxReachedTime === "number" &&
  "watchedSeconds" in value &&
  typeof value.watchedSeconds === "number" &&
  "watchedPercentage" in value &&
  typeof value.watchedPercentage === "number" &&
  "isCompleted" in value &&
  typeof value.isCompleted === "boolean" &&
  "isStarted" in value &&
  typeof value.isStarted === "boolean" &&
  "pauseCount" in value &&
  typeof value.pauseCount === "number";
