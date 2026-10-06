import { InputBlockType } from "@typebot.io/blocks-inputs/constants";
import { z } from "zod";

const inputBlockTypes = new Set<string>(Object.values(InputBlockType));

const blockSchema = z.object({
  type: z.string(),
  options: z
    .object({
      variableId: z.string().optional(),
      audioClip: z.object({ saveVariableId: z.string().optional() }).optional(),
      videoClip: z.object({ saveVariableId: z.string().optional() }).optional(),
    })
    .passthrough()
    .optional(),
  content: z
    .object({
      watchTracking: z.object({ variableId: z.string().optional() }).optional(),
    })
    .passthrough()
    .optional(),
});

const groupsSchema = z.array(
  z.object({ blocks: z.array(z.unknown()) }).passthrough(),
);
const variablesSchema = z.array(z.object({ id: z.string(), name: z.string() }));

/**
 * Variables answered in the interview (one Airtable column each): input
 * answers, voice / video files and watched video shares, in flow order.
 */
export const getAnswerVariableNames = (groups: unknown, variables: unknown) => {
  const nameById = new Map(
    (variablesSchema.safeParse(variables).data ?? []).map((variable) => [
      variable.id,
      variable.name,
    ]),
  );
  const names: string[] = [];
  for (const group of groupsSchema.safeParse(groups).data ?? [])
    for (const rawBlock of group.blocks) {
      const block = blockSchema.safeParse(rawBlock).data;
      if (!block) continue;
      const variableIds = inputBlockTypes.has(block.type)
        ? [
            block.options?.variableId,
            block.options?.audioClip?.saveVariableId,
            block.options?.videoClip?.saveVariableId,
          ]
        : [block.content?.watchTracking?.variableId];
      for (const variableId of variableIds) {
        const name = variableId ? nameById.get(variableId) : undefined;
        if (name && !names.includes(name)) names.push(name);
      }
    }
  return names;
};
