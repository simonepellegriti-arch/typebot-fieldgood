import type { InterviewStatus } from "./schemas";

type ResultTimingInput = {
  createdAt: Date;
  hasStarted: boolean | null;
  isCompleted: boolean;
  completedAt?: Date | null;
};

export type InterviewTiming = {
  status: InterviewStatus;
  isStarted: boolean;
  isCompleted: boolean;
  startTs: Date;
  endTs: Date | null;
  /** true when END_TS comes from the last answer (result completed before completedAt existed) */
  isEndTsEstimated: boolean;
  lastActivityTs: Date;
  durationSeconds: number | null;
};

/**
 * START_TS = result creation (respondent opened the interview).
 * END_TS = completion timestamp; for legacy completed results it falls back to the last answer.
 * DURATION_SECONDS = END_TS - START_TS, or last activity - START_TS for incomplete interviews.
 * ABANDONED = started, not completed and inactive for longer than `abandonedAfterMinutes`.
 */
export const computeInterviewTiming = (
  result: ResultTimingInput,
  {
    answerDates,
    abandonedAfterMinutes,
    now,
  }: {
    answerDates: Date[];
    abandonedAfterMinutes: number;
    now: Date;
  },
): InterviewTiming => {
  const startTs = result.createdAt;
  const lastAnswerTs = answerDates.reduce<Date | undefined>(
    (latestDate, answerDate) =>
      !latestDate || answerDate > latestDate ? answerDate : latestDate,
    undefined,
  );
  const isStarted = Boolean(result.hasStarted) || answerDates.length > 0;
  const isCompleted = result.isCompleted;
  const endTs = isCompleted
    ? (result.completedAt ?? lastAnswerTs ?? null)
    : null;
  const isEndTsEstimated = isCompleted && !result.completedAt;
  const lastActivityTs = [
    startTs,
    lastAnswerTs,
    endTs ?? undefined,
  ].reduce<Date>(
    (latestDate, candidateDate) =>
      candidateDate && candidateDate > latestDate ? candidateDate : latestDate,
    startTs,
  );
  const durationEndTs = endTs ?? (isStarted ? lastActivityTs : null);
  const durationSeconds = durationEndTs
    ? Math.max(
        0,
        Math.round((durationEndTs.getTime() - startTs.getTime()) / 1000),
      )
    : null;

  return {
    status: computeStatus({
      isStarted,
      isCompleted,
      lastActivityTs,
      abandonedAfterMinutes,
      now,
    }),
    isStarted,
    isCompleted,
    startTs,
    endTs,
    isEndTsEstimated,
    lastActivityTs,
    durationSeconds,
  };
};

const computeStatus = ({
  isStarted,
  isCompleted,
  lastActivityTs,
  abandonedAfterMinutes,
  now,
}: {
  isStarted: boolean;
  isCompleted: boolean;
  lastActivityTs: Date;
  abandonedAfterMinutes: number;
  now: Date;
}): InterviewStatus => {
  if (isCompleted) return "COMPLETE";
  if (!isStarted) return "NOT_STARTED";
  const inactiveMinutes = (now.getTime() - lastActivityTs.getTime()) / 60_000;
  return inactiveMinutes > abandonedAfterMinutes ? "ABANDONED" : "STARTED";
};
