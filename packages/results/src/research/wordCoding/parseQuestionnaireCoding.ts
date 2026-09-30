export type WordQuestionKind =
  | "single"
  | "multiple"
  | "open"
  | "matrix"
  | "unknown";

export type WordOption = {
  code: string;
  label: string;
  /** Score declared in the Word file, e.g. "[score: 5]" or "(punti -2)". */
  score?: number;
  isExclusive?: boolean;
  /** "Altro, specificare" / "Other, please specify". */
  hasTextInput?: boolean;
  /** Routing written next to the option ("→ D5", "PASSARE A D5"). */
  routing?: string;
};

export type WordQuestion = {
  /** Position in the Word document (0-based). */
  index: number;
  /** Variable name written in the document (D1, Q10, S2A...). */
  variableName: string;
  /** Question number (digits of the variable name). */
  number?: string;
  text: string;
  kind: WordQuestionKind;
  /** Answer codes (matrix: the scale columns). */
  options: WordOption[];
  /** Matrix statements, when the document lists them separately. */
  rows: WordOption[];
  routing: string[];
  instructions: string[];
};

/**
 * Recognizes questions and answer codes in the text of a Word questionnaire:
 *
 *   D1. Genere                     → variableName D1, text "Genere"
 *   1. Uomo  /  1) Uomo  /  1 = Uomo  /  Uomo ...... 1  /  table "1 | Uomo"
 *   99. Preferisco non rispondere [ESCLUSIVA]
 *   [RISPOSTA MULTIPLA] / [APERTA] / [GRIGLIA] / SE 2 PASSARE A D5
 *
 * Nothing is guessed silently: unrecognized lines are kept as instructions.
 */
export const parseQuestionnaireCoding = (lines: string[]): WordQuestion[] => {
  const questions: WordQuestion[] = [];
  let currentQuestion: WordQuestion | undefined;
  let matrixSection: "rows" | "columns" | undefined;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/g, "").replace(/^\s+/g, "");
    if (!line) continue;

    const header = parseQuestionHeader(line);
    if (header) {
      currentQuestion = {
        index: questions.length,
        variableName: header.variableName,
        number: header.variableName.match(/\d+/)?.[0],
        text: header.text,
        kind: "unknown",
        options: [],
        rows: [],
        routing: [],
        instructions: [],
      };
      questions.push(currentQuestion);
      matrixSection = undefined;
      applyInstruction(currentQuestion, header.instructionText, {
        isQuestionText: true,
      });
      continue;
    }
    if (!currentQuestion) continue;

    const sectionMarker = parseMatrixSectionMarker(line);
    if (sectionMarker) {
      matrixSection = sectionMarker;
      currentQuestion.kind = "matrix";
      continue;
    }

    const option = parseOptionLine(line);
    if (option) {
      if (matrixSection === "rows") currentQuestion.rows.push(option);
      else currentQuestion.options.push(option);
      if (option.routing)
        currentQuestion.routing.push(`${option.code}: ${option.routing}`);
      continue;
    }

    if (isInstructionLine(line) || currentQuestion.options.length > 0) {
      currentQuestion.instructions.push(line);
      applyInstruction(currentQuestion, line, { isQuestionText: false });
      continue;
    }
    // Question texts written on several lines.
    currentQuestion.text = `${currentQuestion.text} ${line}`.trim();
  }

  return questions.map(finalizeKind);
};

const parseQuestionHeader = (line: string) => {
  const match =
    line.match(
      /^(?:domanda\s+|question\s+)?([A-Za-z]{1,4}\s?\d{1,4}(?:[._]?[A-Za-z0-9]{1,4})?)\s*[.):\-–—]\s*(.+)$/i,
    ) ?? line.match(/^([A-Za-z]{1,3}\d{1,4}[A-Za-z]?)\s+([A-ZÀ-Ü¿"«].+)$/);
  if (!match) return;
  const [, rawName, text] = match;
  if (!rawName || !text) return;
  // "Sì. ..." or "No - ..." are answer lines, not questions: require a digit.
  if (!/\d/.test(rawName)) return;
  return {
    variableName: rawName.replace(/\s+/g, "").replace(/\./g, "_").toUpperCase(),
    // "[GRIGLIA]", "(RISPOSTA MULTIPLA)"... are instructions, not question text.
    text: text.replace(/\s*\[[^\]]*\]\s*/g, " ").trim() || text.trim(),
    instructionText: text,
  };
};

const parseMatrixSectionMarker = (line: string) => {
  const normalizedLine = line
    .replace(/[[\]():]/g, "")
    .trim()
    .toLowerCase();
  if (/^(righe|items?|affermazioni|statements?|rows?)$/.test(normalizedLine))
    return "rows" as const;
  if (/^(colonne|scala|columns?|scale)$/.test(normalizedLine))
    return "columns" as const;
};

const routingPattern =
  /(?:[[(]\s*)?(?:→|->|=>|(?:passare|vai|andare|salta(?:re)?|go|skip)\s+(?:a|to)?)\s*([A-Za-z]{1,4}\d{1,4}[A-Za-z0-9_]*|fine|end)\s*[\])]?/i;

const parseOptionLine = (rawLine: string): WordOption | undefined => {
  // Routing can follow the code ("No ..... 2 → D7"): read it first.
  const routingMatch = rawLine.match(routingPattern);
  const line = routingMatch
    ? rawLine.replace(routingMatch[0], " ").trim()
    : rawLine;
  const option = parseCodeAndLabel(line);
  if (!option) return;
  return routingMatch?.[1]
    ? { ...option, routing: routingMatch[1].toUpperCase() }
    : option;
};

const parseCodeAndLabel = (line: string): WordOption | undefined => {
  const codeFirst = line.match(/^\(?(\d{1,4})\s*(?:[).:=\-–—]|\t)\s*(.+)$/);
  const codeLast = codeFirst
    ? undefined
    : line.match(
        /^(.+?)\s*(?:\.{2,}|\t|\s[-–—=]\s|\s{2,})\s*\(?(\d{1,4})\)?\.?$/,
      );
  const code = codeFirst?.[1] ?? codeLast?.[2];
  const rawLabel = codeFirst?.[2] ?? codeLast?.[1];
  if (!code || !rawLabel) return;
  return parseOptionAnnotations(code, rawLabel);
};

const parseOptionAnnotations = (code: string, rawLabel: string): WordOption => {
  let label = rawLabel;
  const option: WordOption = { code, label };

  const scoreMatch = label.match(
    /[[(]\s*(?:score|punti|punteggio|pt|points?)\s*[:=]?\s*([+-]?\d+(?:[.,]\d+)?)\s*[\])]/i,
  );
  if (scoreMatch?.[1]) {
    option.score = Number(scoreMatch[1].replace(",", "."));
    label = label.replace(scoreMatch[0], " ");
  }

  const exclusiveMatch = label.match(
    /[[(]\s*(?:esclusiv[ao]|exclusive|excl\.?)\s*[\])]/i,
  );
  if (exclusiveMatch) {
    option.isExclusive = true;
    label = label.replace(exclusiveMatch[0], " ");
  }

  if (/specifica|specify|precisare|indicare quale/i.test(label))
    option.hasTextInput = true;

  option.label = label
    .replace(/[_.…]{3,}\s*$/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s:–—-]+|[\s:–—-]+$/g, "")
    .trim();
  if (
    !option.isExclusive &&
    /^(nessun[oa]?\b.*|non so\b.*|preferisco non rispondere|none of (these|the above)|don'?t know)$/i.test(
      option.label,
    )
  )
    option.isExclusive = true;
  return option;
};

const isInstructionLine = (line: string) =>
  /^[[(<].*[\])>]$/.test(line) ||
  (line === line.toUpperCase() && /[A-Z]{3,}/.test(line)) ||
  /^(se|if)\s/i.test(line) ||
  /^(intervistatore|interviewer|programmatore|programmer|nota|note)\b/i.test(
    line,
  );

const applyInstruction = (
  question: WordQuestion,
  text: string,
  { isQuestionText }: { isQuestionText: boolean },
) => {
  const lowerText = text.toLowerCase();
  if (
    /risposta multipla|multipl[ae]|più risposte|possibili più|multiple (answers?|choice|response)|select all|\bma\b|\bmr\b/.test(
      lowerText,
    )
  )
    question.kind = "multiple";
  else if (
    /risposta singola|una sola risposta|single (answer|choice|response)|\bsa\b|\bsr\b/.test(
      lowerText,
    ) &&
    question.kind === "unknown"
  )
    question.kind = "single";
  else if (
    /\b(aperta|open|testo libero|open[- ]ended|verbatim)\b/.test(lowerText)
  )
    question.kind = "open";
  else if (/\b(griglia|matrice|matrix|grid)\b/.test(lowerText))
    question.kind = "matrix";

  if (isQuestionText) return;
  const routingMatch = text.match(
    /(?:passare|vai|andare|salta(?:re)?|go to|skip to)\s+(?:a\s+)?([A-Za-z]{1,4}\d{1,4}[A-Za-z0-9_]*|fine|end)/i,
  );
  if (routingMatch) question.routing.push(text);
};

const finalizeKind = (question: WordQuestion): WordQuestion => {
  if (question.kind !== "unknown") return question;
  if (question.rows.length > 0) return { ...question, kind: "matrix" };
  if (question.options.length === 0) return { ...question, kind: "open" };
  return { ...question, kind: "single" };
};
