import { describe, expect, it, mock } from "bun:test";
import type { SessionState } from "@typebot.io/chat-session/schemas";

const answerCount = mock();
const answerCreateMany = mock();
const resultUpdateMany = mock();

mock.module("@typebot.io/prisma", () => ({
  default: {
    answerV2: { count: answerCount, createMany: answerCreateMany },
    result: { updateMany: resultUpdateMany },
  },
}));

const { saveAnswer } = await import("./saveAnswer");
const { markResultAsCompleted } = await import("./markResultAsCompleted");

const state = {
  typebotsQueue: [{ resultId: "result-1" }],
} as unknown as SessionState;

describe("saveAnswer", () => {
  it("never overwrites a previous answer to the same block (probing loops)", async () => {
    answerCount.mockResolvedValueOnce(0).mockResolvedValueOnce(1);
    answerCreateMany.mockResolvedValue({ count: 1 });

    await saveAnswer({
      answer: { blockId: "probe_1", content: "prima risposta" },
      state,
    });
    await saveAnswer({
      answer: { blockId: "probe_1", content: "seconda risposta" },
      state,
    });

    expect(answerCount).toHaveBeenCalledWith({
      where: { resultId: "result-1", blockId: "probe_1" },
    });
    expect(answerCreateMany.mock.calls.map((call) => call[0].data[0])).toEqual([
      {
        blockId: "probe_1",
        content: "prima risposta",
        resultId: "result-1",
        executionIndex: 1,
      },
      {
        blockId: "probe_1",
        content: "seconda risposta",
        resultId: "result-1",
        executionIndex: 2,
      },
    ]);
  });

  it("stores typed values and labels next to the legacy content", async () => {
    answerCount.mockResolvedValueOnce(0);
    answerCreateMany.mockClear();

    await saveAnswer({
      answer: {
        blockId: "d2",
        content: "1, 3",
        value: [1, 3],
        valueLabel: ["Rosso, scuro", "Verde"],
      },
      state,
    });

    expect(answerCreateMany.mock.calls[0]![0].data[0]).toMatchObject({
      content: "1, 3",
      value: [1, 3],
      valueLabel: ["Rosso, scuro", "Verde"],
      executionIndex: 1,
    });
  });
});

describe("markResultAsCompleted", () => {
  it("only sets END_TS once", async () => {
    const completedAt = new Date("2026-09-28T10:10:00.000Z");
    resultUpdateMany.mockResolvedValue({ count: 1 });
    await markResultAsCompleted({ resultId: "result-1", completedAt });
    expect(resultUpdateMany).toHaveBeenCalledWith({
      where: { id: "result-1", completedAt: null },
      data: { completedAt },
    });
  });
});
