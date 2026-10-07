import { generateObject, type LanguageModel } from "ai";
import { z } from "zod";

/**
 * Short titles of the questions for the client's dashboard ("Lavoro e stile
 * di vita"), written by the workspace AI in the questionnaire's language.
 * Questions the AI skips (or every question, without AI) get the beginning
 * of their text.
 */
export const synthesizeQuestionTitles = async ({
  models,
  questions,
}: {
  models: LanguageModel[];
  questions: { code: string; text: string }[];
}) => {
  const titles = new Map<string, string>();
  const batches: { code: string; text: string }[][] = [];
  for (let start = 0; start < questions.length; start += batchSize)
    batches.push(questions.slice(start, start + batchSize));
  const results = await Promise.all(
    batches.map((batch) => generateTitles(models, batch).catch(() => [])),
  );
  for (const { code, title } of results.flat())
    if (title.trim()) titles.set(code, title.trim());
  for (const question of questions)
    if (!titles.has(question.code))
      titles.set(question.code, fallbackTitle(question.text) || question.code);
  return titles;
};

const batchSize = 60;

const titlesSchema = z.object({
  titles: z.array(z.object({ code: z.string(), title: z.string() })),
});

const systemPrompt = `You title the columns of a market-research dashboard shared with the client.
For every question you get its code and its text as shown to the respondent. Write a short title of what the question asks:
- 2 to 6 words, at most 45 characters, in the language of the question (usually Italian)
- a neutral noun phrase, no question mark, no code, no quotes, no emoji
- keep product, brand or stimulus names when the question is about one of them (repeated blocks must stay distinguishable)
- ignore greetings, thanks and instructions such as "una sola risposta" or "puoi rispondere a voce"
Examples: "Che cosa fai nella vita e come descriveresti il tuo stile di vita?" → "Lavoro e stile di vita"; "Quanto ti è piaciuto lo spot di Gaviscon che hai appena visto?" → "Gradimento spot Gaviscon".
Return one title per code.`;

const generateTitles = async (
  models: LanguageModel[],
  batch: { code: string; text: string }[],
) => {
  let lastError: unknown;
  for (const model of models) {
    try {
      const { object } = await generateObject({
        model,
        schema: titlesSchema,
        system: systemPrompt,
        prompt: JSON.stringify(
          batch.map((question) => ({
            code: question.code,
            text: question.text.slice(0, 600),
          })),
        ),
        providerOptions: { openai: { strictJsonSchema: true } },
        maxRetries: 1,
      });
      return object.titles;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
};

/** First sentence of the question, cut at a word. */
const fallbackTitle = (text: string) => {
  const firstLine =
    text
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.length > 0) ?? "";
  const sentence = firstLine.split(/(?<=[?.!])\s/)[0] ?? firstLine;
  if (sentence.length <= 60) return sentence.replace(/[?.!:]+$/, "");
  return `${sentence.slice(0, 57).replace(/\s+\S*$/, "")}…`;
};
