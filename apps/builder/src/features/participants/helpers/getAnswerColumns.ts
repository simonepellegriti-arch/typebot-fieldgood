import { InputBlockType } from "@typebot.io/blocks-inputs/constants";
import { z } from "zod";

/**
 * Columns of the interview answers (one Airtable field each), in flow order:
 * input answers, AI follow-up answers, voice / video files, GPT
 * transcriptions and watched video shares. Each column knows the question it
 * belongs to, so the dashboard can be titled with the question instead of
 * its code.
 */
export const getAnswerColumns = (groups: unknown, variables: unknown) => {
  const nameById = new Map(
    (variablesSchema.safeParse(variables).data ?? []).map((variable) => [
      variable.id,
      variable.name,
    ]),
  );
  const nameOf = (variableId: string | undefined) =>
    variableId ? nameById.get(variableId) : undefined;
  const columns: AnswerColumn[] = [];
  const columnByVariable = new Map<string, AnswerColumn>();
  const add = (column: AnswerColumn) => {
    if (columnByVariable.has(column.variableName)) return;
    if (isTechnicalName(column.variableName)) return;
    columns.push(column);
    columnByVariable.set(column.variableName, column);
  };
  // Audio variable → answer it belongs to (transcriptions point at the audio).
  const answerByAudioVariable = new Map<string, string>();

  for (const group of groupsSchema.safeParse(groups).data ?? []) {
    let pendingText: string[] = [];
    for (const rawBlock of group.blocks) {
      const block = blockSchema.safeParse(rawBlock).data;
      if (!block) continue;
      if (block.type === "text") {
        const text = getPlainText(block.content?.richText);
        if (text) pendingText.push(text);
        continue;
      }
      const watchVariable = nameOf(block.content?.watchTracking?.variableId);
      if (watchVariable) {
        const baseName = watchVariable.replace(/_VISIONE$/, "");
        add({
          variableName: watchVariable,
          kind: "watch",
          baseName,
          round: undefined,
          questionText: pendingText.join("\n") || group.title,
        });
        continue;
      }
      if (inputBlockTypes.has(block.type)) {
        const answerName = nameOf(block.options?.variableId);
        if (answerName) {
          const probe = answerName.match(/^(.+)_R(\d+)$/);
          const probedColumn = probe
            ? columnByVariable.get(probe[1] ?? "")
            : undefined;
          const answerColumn: AnswerColumn =
            probe && probedColumn
              ? {
                  variableName: answerName,
                  kind: "answer",
                  baseName: probedColumn.baseName,
                  round: Number(probe[2]),
                  questionText: probedColumn.questionText,
                }
              : {
                  variableName: answerName,
                  kind: "answer",
                  baseName: answerName,
                  round: undefined,
                  questionText: pendingText.join("\n") || group.title,
                };
          add(answerColumn);
          const audioName = nameOf(block.options?.audioClip?.saveVariableId);
          if (audioName) {
            answerByAudioVariable.set(audioName, answerName);
            add({ ...answerColumn, variableName: audioName, kind: "audio" });
          }
          const videoName = nameOf(block.options?.videoClip?.saveVariableId);
          if (videoName)
            add({ ...answerColumn, variableName: videoName, kind: "video" });
        }
        pendingText = [];
        continue;
      }
      if (
        block.type === "openai" &&
        block.options?.action === "Create transcription"
      ) {
        const transcriptionName = nameOf(block.options.transcriptionVariableId);
        const audioName = block.options.url?.match(/^\{\{(.+)\}\}$/)?.[1];
        const answerName = audioName
          ? answerByAudioVariable.get(audioName)
          : undefined;
        const answerColumn = answerName
          ? columnByVariable.get(answerName)
          : undefined;
        // Older bots write the transcription over the answer: no extra column.
        if (transcriptionName && answerColumn)
          add({
            ...answerColumn,
            variableName: transcriptionName,
            kind: "transcription",
          });
      }
    }
  }
  return columns;
};

export type AnswerColumn = {
  variableName: string;
  kind: "answer" | "audio" | "video" | "transcription" | "watch";
  /** Code of the question (the follow-ups and files of A1 have "A1"). */
  baseName: string;
  /** AI follow-up round (A1_R1 → 1). */
  round: number | undefined;
  questionText: string;
};

const inputBlockTypes = new Set<string>(Object.values(InputBlockType));

const richTextSchema = z.array(z.unknown());

const blockSchema = z.object({
  type: z.string(),
  options: z
    .object({
      variableId: z.string().optional(),
      audioClip: z.object({ saveVariableId: z.string().optional() }).optional(),
      videoClip: z.object({ saveVariableId: z.string().optional() }).optional(),
      action: z.string().optional(),
      url: z.string().optional(),
      transcriptionVariableId: z.string().optional(),
    })
    .passthrough()
    .optional(),
  content: z
    .object({
      richText: richTextSchema.optional(),
      watchTracking: z.object({ variableId: z.string().optional() }).optional(),
    })
    .passthrough()
    .optional(),
});

const groupsSchema = z.array(
  z
    .object({ title: z.string().default(""), blocks: z.array(z.unknown()) })
    .passthrough(),
);
const variablesSchema = z.array(z.object({ id: z.string(), name: z.string() }));

const textNodeSchema = z.object({
  text: z.string().optional(),
  italic: z.boolean().optional(),
  children: z.array(z.unknown()).optional(),
});

/** Text of a bubble without the italic hints ("Una sola risposta"). */
const getPlainText = (richText: unknown[] | undefined): string => {
  const lines = (richText ?? []).map((node) => collectText(node)).join("\n");
  return lines.replace(/\n{2,}/g, "\n").trim();
};

const collectText = (node: unknown): string => {
  const parsed = textNodeSchema.safeParse(node).data;
  if (!parsed) return "";
  if (parsed.text !== undefined) return parsed.italic ? "" : parsed.text;
  return (parsed.children ?? []).map(collectText).join("");
};

/** Microphone test and second viewings: not answers for the client's dashboard. */
const isTechnicalName = (name: string) =>
  /^test_vocale/i.test(name) || /_VISIONE_BIS$/.test(name);
