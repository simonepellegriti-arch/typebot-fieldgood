import type {
  QuestionnaireConditionGroup,
  QuestionnaireQuestion,
  QuestionnaireSpec,
} from "../questionnaireSpecSchema";

/**
 * Writes out the questions repeated for each loop item (G1 → G1_GAV, G1_ESO…),
 * with the item stimulus before the first repeated question. Randomized loops
 * come back as rotations: the bot shows their blocks in a random order.
 */
export const expandQuestionLoops = (spec: QuestionnaireSpec) => {
  const warnings: string[] = [];
  const rotations: Rotation[] = [];
  let questions = spec.questions;
  for (const loop of spec.loops) {
    const findIndex = (code: string) =>
      questions.findIndex(
        (question) => question.code.toLowerCase() === code.trim().toLowerCase(),
      );
    const firstIndex = findIndex(loop.firstQuestion);
    const lastIndex = findIndex(loop.lastQuestion);
    const items = loop.items.filter((item) => item.code);
    if (firstIndex === -1 || lastIndex < firstIndex || items.length === 0) {
      warnings.push(
        `Ripetizione ${loop.name}: le domande da ${loop.firstQuestion} a ${loop.lastQuestion} non sono state trovate, non è stata applicata.`,
      );
      continue;
    }
    const repeated = questions.slice(firstIndex, lastIndex + 1);
    const repeatedCodes = new Set(repeated.map((question) => question.code));
    const blocks = items.map((item) => {
      const suffixed = (code: string) =>
        repeatedCodes.has(code) ? `${code}_${item.code}` : code;
      const rewriteText = (text: string) =>
        text.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_match, name: string) =>
          name === loop.name ? item.label : `{{${suffixed(name)}}}`,
        );
      const rewriteConditions = (
        group: QuestionnaireConditionGroup | null,
      ): QuestionnaireConditionGroup | null =>
        group && {
          ...group,
          conditions: group.conditions.map((condition) => ({
            ...condition,
            questionCode: suffixed(condition.questionCode),
          })),
        };
      return {
        itemCode: item.code,
        label: item.label,
        questions: repeated.map(
          (question, index): QuestionnaireQuestion => ({
            ...question,
            code: suffixed(question.code),
            text: rewriteText(question.text),
            instructions: question.instructions
              ? rewriteText(question.instructions)
              : null,
            options: question.options.map((option) => ({
              ...option,
              goTo: option.goTo
                ? option.goTo.replace(/[\p{L}\p{N}_]+$/u, suffixed)
                : null,
            })),
            showIf: rewriteConditions(question.showIf),
            terminateIf: rewriteConditions(question.terminateIf),
            stimulus:
              index === 0 && item.stimulus ? item.stimulus : question.stimulus,
          }),
        ),
      };
    });
    questions = [
      ...questions.slice(0, firstIndex),
      ...blocks.flatMap((block) => block.questions),
      ...questions.slice(lastIndex + 1),
    ];
    if (loop.isRandomized && blocks.length > 1)
      rotations.push({
        name: loop.name,
        blocks: blocks.map((block) => ({
          itemCode: block.itemCode,
          label: block.label,
          questions: block.questions,
        })),
      });
  }
  return { questions, rotations, warnings };
};

export type Rotation = {
  name: string;
  /** The expanded question objects of each block (codes may still be renamed). */
  blocks: {
    itemCode: string;
    label: string;
    questions: QuestionnaireQuestion[];
  }[];
};
