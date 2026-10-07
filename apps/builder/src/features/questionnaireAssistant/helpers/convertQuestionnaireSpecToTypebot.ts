import { createId } from "@paralleldrive/cuid2";
import { BubbleBlockType } from "@typebot.io/blocks-bubbles/constants";
import { InputBlockType } from "@typebot.io/blocks-inputs/constants";
import { maxPhotosLimit } from "@typebot.io/blocks-inputs/photo/constants";
import {
  ComparisonOperators,
  LogicalOperator,
} from "@typebot.io/conditions/constants";
import type {
  QuestionnaireAirtable,
  QuestionnaireCondition,
  QuestionnaireConditionGroup,
  QuestionnaireQuestion,
  QuestionnaireSpec,
  QuestionnaireStimulus,
} from "../questionnaireSpecSchema";
import { buildProbePrompt } from "./buildProbePrompt";
import {
  type BotBlock,
  type ConditionItem,
  createBotBuilder,
  type GroupBuilder,
  type LazyTarget,
} from "./createBotBuilder";
import { expandQuestionLoops } from "./expandQuestionLoops";
import { type BotLabels, getBotLabels } from "./getBotLabels";

/**
 * Builds a v6 bot from a questionnaire spec, the way FieldGood scripts its
 * bots: one group per question linked in order, filters as a condition at the
 * top of the question (skip to the next one), screen-outs as a condition
 * after the answer. Each answer is saved in a variable named after the
 * question code (the column of the SPSS export).
 *
 * Optionally: voice answers transcribed with the workspace OpenAI key, AI
 * follow-ups ("rilanci"), piped answers, texts computed from link variables,
 * and the Airtable frame (respondent lookup, privacy, live answers on the
 * record, resume from the last answered question with the routing respected).
 */
export const convertQuestionnaireSpecToTypebot = (
  spec: QuestionnaireSpec,
  { openAiCredentialsId }: { openAiCredentialsId?: string } = {},
) => {
  const labels = getBotLabels(spec.language, spec.addressForm);
  const warnings: string[] = [];
  const bot = createBotBuilder();
  // Repeated questions (one block per stimulus) written out, then unique codes.
  const expanded = expandQuestionLoops(spec);
  warnings.push(...expanded.warnings);
  const questions = deduplicateCodes(expanded.questions);
  const finalCodeOf = new Map(
    expanded.questions.map((question, index) => [
      question,
      questions[index]?.code ?? question.code,
    ]),
  );
  const rotations = expanded.rotations.map((rotation) => ({
    name: rotation.name,
    blocks: rotation.blocks.map((block) => ({
      itemCode: block.itemCode,
      label: block.label,
      codes: block.questions.map(
        (question) => finalCodeOf.get(question) ?? question.code,
      ),
    })),
  }));
  const questionByCode = new Map(
    questions.map((question) => [question.code, question]),
  );
  const airtable = spec.airtable;
  const isAnswered = (question: QuestionnaireQuestion) =>
    question.type !== "info" && question.type !== "continue";
  const hasLabelVariable = (question: QuestionnaireQuestion) =>
    question.type === "single" ||
    question.type === "multiple" ||
    question.type === "matrix";

  // Variables: answers first, in questionnaire order.
  for (const question of questions)
    if (isAnswered(question)) bot.variable(question.code);
  for (const linkVariable of spec.linkVariables)
    bot.variable(linkVariable.name);
  if (airtable) {
    bot.variable(airtable.linkParameter);
    for (const field of airtable.loadFields) bot.variable(field.variable);
  }

  // Piped answers of choice / grid questions show their labels.
  const labelledCodes = new Set(
    airtable
      ? questions.filter(hasLabelVariable).map((question) => question.code)
      : [],
  );
  const allTexts = [
    spec.introText,
    spec.closingText,
    spec.screenOutText,
    ...questions.flatMap((question) => [question.text, question.instructions]),
    ...spec.computedVariables.flatMap((variable) => [
      variable.defaultText,
      ...variable.cases.map((item) => item.text),
    ]),
  ];
  for (const text of allTexts)
    for (const match of (text ?? "").matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)) {
      const question = match[1] ? questionByCode.get(match[1]) : undefined;
      if (question && hasLabelVariable(question))
        labelledCodes.add(question.code);
    }
  const pipe = (text: string) =>
    text.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (full, name: string) =>
      labelledCodes.has(name) ? `{{${name}_TESTO}}` : full,
    );

  const usesAi = questions.some(
    (question) =>
      (isOpen(question) && question.media === "voice") ||
      (isOpen(question) && question.probe),
  );
  if (usesAi && !openAiCredentialsId)
    warnings.push(
      "Trascrizioni dei vocali e rilanci AI richiedono una chiave OpenAI tra le credenziali del workspace: non sono stati inseriti.",
    );
  const hasVoiceQuestions = questions.some(
    (question) => isOpen(question) && question.media === "voice",
  );

  // Groups of the flow, in order.
  const setupGroup = bot.createGroup("SETTA SPECIFICHE AIRTABLE");
  const loadGroup = bot.createGroup("PRENDI INFO RESPONDENT E VERIFICA");
  const errorGroup = bot.createGroup("ERRORE - link non valido");
  const prepareGroup = bot.createGroup("PREPARAZIONE");
  const resumeGroup = bot.createGroup("RIPRESA");
  const privacyGroup = bot.createGroup("PRIVACY");
  const voiceTestGroup = bot.createGroup("TEST VOCALI");
  const voiceTestWrittenGroup = bot.createGroup("TEST VOCALI · scrive");
  const introGroup = bot.createGroup("Introduzione");
  const questionGroups = questions.map((question) => ({
    question,
    group: bot.createGroup(question.code),
  }));
  const endGroup = bot.createGroup("FINE");
  const screenOutGroup = bot.createGroup("Fine anticipata (screen-out)");

  // Rotations: a dispatcher group sends the respondent to the blocks in a
  // random order, one after the other, then on to the rest.
  const questionIndexByCode = new Map(
    questions.map((question, index) => [question.code, index]),
  );
  const rotationRouters = rotations.flatMap((rotation) => {
    const blocks = rotation.blocks.flatMap((block) => {
      const firstIndex = questionIndexByCode.get(block.codes[0] ?? "");
      const lastIndex = questionIndexByCode.get(block.codes.at(-1) ?? "");
      const doneMarker = block.codes.find((code) => {
        const question = questionByCode.get(code);
        return question && isAnswered(question) && !question.showIf;
      });
      if (firstIndex === undefined || lastIndex === undefined || !doneMarker)
        return [];
      return [{ ...block, firstIndex, lastIndex, doneMarker }];
    });
    if (blocks.length < 2) {
      warnings.push(
        `Ripetizione ${rotation.name}: l'ordine casuale richiede blocchi con almeno una domanda sempre posta; i blocchi restano nell'ordine del documento.`,
      );
      return [];
    }
    return [
      {
        name: rotation.name,
        blocks,
        startIndex: Math.min(...blocks.map((block) => block.firstIndex)),
        endIndex: Math.max(...blocks.map((block) => block.lastIndex)),
        group: bot.createGroup(`ROTAZIONE ${rotation.name}`),
      },
    ];
  });
  const sequentialNextAfter = (index: number): LazyTarget =>
    questionGroups[index + 1]?.group.start() ?? endGroup.start();
  const nextAfter = (index: number): LazyTarget => {
    const router = rotationRouters.find(
      (candidate) =>
        candidate.startIndex === index + 1 ||
        candidate.blocks.some((block) => block.lastIndex === index),
    );
    return router ? router.group.start() : sequentialNextAfter(index);
  };
  const firstQuestionTarget = questionGroups[0]
    ? nextAfter(-1)
    : endGroup.start();

  const recordUrl =
    "https://api.airtable.com/v0/{{base_id}}/{{table_id}}/{{record_id_airtable}}";
  const patchRecord = (fields: Record<string, string>) =>
    bot.httpRequest({
      method: "PATCH",
      url: recordUrl,
      authorizationVariable: "auth_airtable",
      body: JSON.stringify({ fields, typecast: true }, null, 2),
    });
  const saveCheckpoint = (
    group: GroupBuilder,
    checkpoint: string,
    status: string,
    fields: Record<string, string> = {},
  ) => {
    if (!airtable) return;
    group.add(
      bot.setVariable("checkpoint", JSON.stringify(checkpoint)),
      patchRecord({ ...fields, Status: status, Checkpoint: checkpoint }),
    );
  };

  // Conditions.
  const conditions = createConditionTranslator({
    bot,
    questionByCode,
    warnings,
  });

  // Airtable: settings, respondent lookup, resume.
  if (airtable) {
    setupGroup
      .add(
        bot.setVariable("base_id", JSON.stringify(airtable.baseId)),
        bot.setVariable("table_id", JSON.stringify(airtable.tableId)),
        bot.setVariable(
          "auth_airtable",
          JSON.stringify("INSERISCI_TOKEN_AIRTABLE"),
        ),
      )
      .setNext(loadGroup.start());
    loadGroup
      .add(
        bot.httpRequest({
          method: "GET",
          url: `https://api.airtable.com/v0/{{base_id}}/{{table_id}}?filterByFormula={${airtable.lookupField}}="{{${airtable.linkParameter}}}"`,
          authorizationVariable: "auth_airtable",
          responseMapping: [
            {
              bodyPath: "data.records[0].id",
              variableName: "record_id_airtable",
            },
            {
              bodyPath: "data.records[0].fields.Checkpoint",
              variableName: "checkpoint",
            },
            {
              bodyPath: "data.records[0].fields.Stato",
              variableName: "stato_json",
            },
            ...airtable.loadFields.map((field) => ({
              bodyPath: `data.records[0].fields['${field.airtableField.replace(/'/g, "\\'")}']`,
              variableName: field.variable,
            })),
          ],
        }),
        bot.condition([
          {
            content: isEmpty(bot.variable("record_id_airtable")),
            to: errorGroup.start(),
          },
        ]),
      )
      .setNext(prepareGroup.start());
    errorGroup.add(bot.textBubble(labels.wrongLink));
    warnings.push(airtableColumnsNote(airtable, questions, spec));
  }

  // Texts computed from link / Airtable variables (from answers: after the answer).
  const computedAfterQuestion = new Map<string, BotBlock[]>();
  for (const computed of spec.computedVariables) {
    bot.variable(computed.sourceVariable);
    const block = bot.setVariable(
      computed.name,
      computedVariableExpression(computed),
    );
    if (questionByCode.has(computed.sourceVariable))
      computedAfterQuestion.set(computed.sourceVariable, [
        ...(computedAfterQuestion.get(computed.sourceVariable) ?? []),
        block,
      ]);
    else prepareGroup.add(block);
  }
  if (airtable)
    prepareGroup.add(
      bot.condition([
        {
          content: isSet(bot.variable("checkpoint")),
          to: resumeGroup.start(),
        },
      ]),
    );
  prepareGroup.setNext(privacyGroup.start());

  // Privacy.
  if (spec.privacyUrl)
    privacyGroup.add(
      bot.textBubble(labels.privacyIntro),
      bot.embedBubble(spec.privacyUrl),
      bot.textBubble(labels.privacyText),
      bot.buttons([{ label: labels.privacyAccept }], "privacy"),
    );
  saveCheckpoint(privacyGroup, "PRIVACY", "CHATBOT INIZIATO", {
    ...(spec.privacyUrl ? { Privacy: "{{privacy}}" } : {}),
  });
  privacyGroup.setNext(voiceTestGroup.start());

  // Microphone test.
  if (spec.voiceTest && hasVoiceQuestions && openAiCredentialsId) {
    voiceTestGroup.add(
      bot.textBubble(labels.voiceTestIntro),
      {
        id: createId(),
        type: InputBlockType.TEXT,
        options: {
          variableId: bot.variable("test_vocale"),
          labels: { placeholder: labels.typeOrSpeak, button: labels.send },
          audioClip: {
            isEnabled: true,
            saveVariableId: bot.variable("test_vocale_URL"),
            visibility: "Public",
          },
        },
      },
      bot.condition([
        {
          content: isEmpty(bot.variable("test_vocale_URL")),
          to: voiceTestWrittenGroup.start(),
        },
      ]),
      bot.transcription({
        credentialsId: openAiCredentialsId,
        audioUrlVariable: "test_vocale_URL",
        resultVariable: "test_vocale",
      }),
      bot.textBubble(
        labels.voiceTestTranscript.replace("{{transcript}}", "{{test_vocale}}"),
      ),
      bot.buttons([{ label: labels.voiceTestOk }]),
    );
    saveCheckpoint(
      voiceTestGroup,
      "TEST_VOCALI",
      "CHATBOT IN CORSO - TEST VOCALI OK",
    );
    voiceTestWrittenGroup.add(bot.textBubble(labels.voiceTestWritten));
    saveCheckpoint(
      voiceTestWrittenGroup,
      "TEST_VOCALI",
      "CHATBOT IN CORSO - RISPONDE SCRIVENDO",
    );
  }
  voiceTestGroup.setNext(introGroup.start());
  voiceTestWrittenGroup.setNext(introGroup.start());

  if (spec.introText) introGroup.add(bot.textBubble(pipe(spec.introText)));
  introGroup.setNext(firstQuestionTarget);

  // Option routing: "Passare a Q5", "Terminare", "Ripetere Q2" (come back later).
  const questionGroupByCode = new Map(
    questionGroups.map(({ question, group }) => [question.code, group]),
  );
  const pauseGroups = new Map<string, GroupBuilder>();
  const pauseGroupFor = (code: string) => {
    const existing = pauseGroups.get(code);
    if (existing) return existing;
    const group = bot.createGroup(`IN PAUSA - riprende da ${code}`);
    group.add(bot.textBubble(labels.pause));
    saveCheckpoint(group, `RIPRENDI:${code}`, "IN PAUSA - TORNA PIÙ TARDI");
    // Personal links: the chat waits here; reopening the link shows the button.
    if (!airtable)
      group.add(
        bot.buttons([
          {
            label: labels.resumeReady,
            to: () =>
              (questionGroupByCode.get(code)?.start() ?? firstQuestionTarget)(),
          },
        ]),
      );
    pauseGroups.set(code, group);
    return group;
  };
  const routeTarget = (
    goTo: string,
    questionCode: string,
  ): LazyTarget | undefined => {
    const normalized = goTo.trim();
    if (/^(END|FINE|TERMINA(RE)?|CHIUDI)$/i.test(normalized))
      return screenOutGroup.start();
    const returnMatch = normalized.match(/^RETURN\s*:\s*(.+)$/i);
    const destination = returnMatch?.[1]?.trim() ?? normalized;
    // "Q4/Q4a": the first of the questions shown to this respondent (panel paths).
    const codes = questionGroupByCode.has(destination)
      ? [destination]
      : destination
          .split(/\s*[/|,]\s*/)
          .map((code) => findQuestionCode(code))
          .filter((code) => code !== undefined);
    if (codes.length === 0) {
      warnings.push(
        `${questionCode}: il salto verso "${goTo}" non corrisponde a nessuna domanda ed è stato ignorato.`,
      );
      return undefined;
    }
    const targetOf = (code: string) =>
      returnMatch
        ? pauseGroupFor(code).start()
        : (questionGroupByCode.get(code)?.start() ?? firstQuestionTarget);
    if (codes.length === 1) return targetOf(codes[0]);
    const routerGroup = bot.createGroup(`SMISTAMENTO ${codes.join(" / ")}`);
    const alternatives = codes.map((code) => ({
      code,
      showIf: questionByCode.get(code)?.showIf ?? null,
    }));
    const routes = alternatives.flatMap(({ code, showIf }) =>
      showIf
        ? conditions
            .toItems(showIf, false, code)
            .map((content) => ({ content, to: targetOf(code) }))
        : [],
    );
    if (routes.length > 0) routerGroup.add(bot.condition(routes));
    const fallback =
      alternatives.find(({ showIf }) => !showIf) ?? alternatives.at(-1);
    routerGroup.setNext(targetOf(fallback?.code ?? codes[0]));
    return routerGroup.start();
  };
  const findQuestionCode = (code: string) =>
    [...questionGroupByCode.keys()].find(
      (candidate) => candidate.toLowerCase() === code.toLowerCase(),
    );
  const resumeTargets = new Map<string, LazyTarget>();

  // Questions.
  questionGroups.forEach(({ question, group }, index) => {
    const next = nextAfter(index);
    group.setNext(next);
    if (question.showIf) {
      const skipItems = conditions.toItems(
        question.showIf,
        true,
        question.code,
      );
      if (skipItems.length > 0)
        skipItems.push(...conditions.unansweredItems(question.showIf));
      if (skipItems.length > 0)
        group.add(
          bot.condition(skipItems.map((content) => ({ content, to: next }))),
        );
    }

    if (question.stimulus)
      addStimulus(group, {
        bot,
        labels,
        stimulus: question.stimulus,
        code: question.code,
      });

    if (question.type === "continue") {
      group.add(
        bot.textBubble(pipe(question.text), question.instructions ?? undefined),
      );
      // The checkpoint is saved before the button: whoever comes back later
      // (e.g. after buying the product) starts from the next question.
      saveCheckpoint(
        group,
        question.code,
        `CHATBOT IN CORSO - ${question.code}`,
      );
      group.add(
        bot.buttons([{ label: question.options[0]?.label ?? labels.continue }]),
      );
      return;
    }

    if (question.type === "photo" && question.photo)
      addCheckedPhotoQuestion(group, {
        bot,
        labels,
        question,
        photo: question.photo,
        pipe,
        credentialsId: openAiCredentialsId,
        failTarget: question.photo.failGoTo
          ? routeTarget(question.photo.failGoTo, question.code)
          : undefined,
      });
    else group.add(...buildQuestionBlocks({ question, bot, labels, pipe }));
    // Readable answer (labels instead of codes) for piping and Airtable.
    if (labelledCodes.has(question.code))
      group.add(
        bot.setVariable(`${question.code}_TESTO`, labelExpression(question)),
      );

    if (isOpen(question) && openAiCredentialsId) {
      if (question.media === "voice")
        addTranscription(group, {
          bot,
          credentialsId: openAiCredentialsId,
          audioUrlVariable: `${question.code}_URL`,
          resultVariable: question.code,
        });
      if (question.probe)
        addFollowUps(group, {
          bot,
          question,
          credentialsId: openAiCredentialsId,
          labels,
          spec,
          pipe,
          saveSummary: Boolean(airtable),
        });
    }

    group.add(...(computedAfterQuestion.get(question.code) ?? []));

    if (airtable && isAnswered(question)) {
      const savedVariables = savedVariablesOf(question, labelledCodes);
      group.add(
        bot.setVariable(
          "stato_json",
          stateUpdateExpression(
            savedVariables.map((name) => [name, bot.variable(name)]),
          ),
        ),
      );
      saveCheckpoint(
        group,
        question.code,
        `CHATBOT IN CORSO - ${question.code}`,
        airtableFieldsOf(question, labelledCodes),
      );
    }

    // On resume, the routing of the last answered question is applied again.
    resumeTargets.set(question.code, group.at(group.mark()));

    if (question.terminateIf) {
      const terminateItems = conditions.toItems(
        question.terminateIf,
        false,
        question.code,
      );
      if (terminateItems.length > 0)
        group.add(
          bot.condition(
            terminateItems.map((content) => ({
              content,
              to: screenOutGroup.start(),
            })),
          ),
        );
    }

    if (question.type === "single") {
      const codesByTarget = new Map<string, string[]>();
      for (const option of question.options)
        if (option.goTo)
          codesByTarget.set(option.goTo, [
            ...(codesByTarget.get(option.goTo) ?? []),
            option.code,
          ]);
      const routes = [...codesByTarget.entries()].flatMap(([goTo, codes]) => {
        const to = routeTarget(goTo, question.code);
        if (!to) return [];
        return [
          {
            to,
            content: {
              logicalOperator: LogicalOperator.OR,
              comparisons: codes.map((code) => ({
                id: createId(),
                variableId: bot.variable(question.code),
                comparisonOperator: ComparisonOperators.EQUAL,
                value: code,
              })),
            },
          },
        ];
      });
      if (routes.length > 0) group.add(bot.condition(routes));
    }
  });

  // Rotation dispatchers: random order drawn once, then the first block not
  // answered yet (also right after a resume).
  for (const router of rotationRouters) {
    const orderVariable = `ordine_${router.name}`;
    const nextVariable = `prossimo_${router.name}`;
    const itemCodes = router.blocks.map((block) => block.itemCode);
    router.group
      .add(
        bot.setVariable(
          orderVariable,
          `return ((order) => { if (order) return String(order); const items = ${JSON.stringify(itemCodes)}; for (let index = items.length - 1; index > 0; index--) { const other = Math.floor(Math.random() * (index + 1)); [items[index], items[other]] = [items[other], items[index]]; } return items.join(","); })({{${orderVariable}}})`,
        ),
        bot.setVariable(
          nextVariable,
          `return ((order, answers) => String(order).split(",").find((item) => answers[item] === undefined || answers[item] === null || answers[item] === "") ?? "FINE")({{${orderVariable}}}, { ${router.blocks
            .map(
              (block) =>
                `${JSON.stringify(block.itemCode)}: {{${block.doneMarker}}}`,
            )
            .join(", ")} })`,
        ),
        bot.condition(
          router.blocks.map((block) => ({
            content: equals(bot.variable(nextVariable), block.itemCode),
            to:
              questionGroups[block.firstIndex]?.group.start() ??
              endGroup.start(),
          })),
        ),
      )
      .setNext(sequentialNextAfter(router.endIndex));
  }
  const missingStimuli = questions.filter(
    (question) => question.stimulus && !question.stimulus.url,
  );
  if (missingStimuli.length > 0)
    warnings.push(
      `Stimoli da caricare nell'editor (blocco video/immagine in testa alla domanda): ${missingStimuli
        .map((question) => `${question.stimulus?.label} → ${question.code}`)
        .join("; ")}.`,
    );

  // Resume: answers restored, then straight to the question after the last one answered.
  if (airtable) {
    for (const question of questions.filter(isAnswered))
      for (const name of savedVariablesOf(question, labelledCodes))
        resumeGroup.add(bot.setVariable(name, restoreExpression(name)));
    for (const blocks of computedAfterQuestion.values())
      resumeGroup.add(...blocks.map((block) => ({ ...block, id: createId() })));
    const checkpointId = bot.variable("checkpoint");
    resumeGroup.add(
      bot.condition([
        {
          content: equals(checkpointId, "PRIVACY"),
          to: voiceTestGroup.start(),
        },
        {
          content: equals(checkpointId, "TEST_VOCALI"),
          to: introGroup.start(),
        },
        ...questionGroups.map(({ question }, index) => ({
          content: equals(checkpointId, question.code),
          to: resumeTargets.get(question.code) ?? nextAfter(index),
        })),
        ...[...pauseGroups.keys()].map((code) => ({
          content: equals(checkpointId, `RIPRENDI:${code}`),
          to: questionGroupByCode.get(code)?.start() ?? firstQuestionTarget,
        })),
        { content: equals(checkpointId, "FINE"), to: endGroup.start() },
        {
          content: equals(checkpointId, "SCREENOUT"),
          to: screenOutGroup.start(),
        },
      ]),
    );
    resumeGroup.setNext(privacyGroup.start());
  }

  endGroup.add(bot.textBubble(pipe(spec.closingText ?? labels.closing)));
  saveCheckpoint(endGroup, "FINE", "CHATBOT CONCLUSO");
  const usesScreenOut = questions.some(
    (question) =>
      question.terminateIf ||
      question.options.some(
        (option) =>
          option.goTo &&
          /^(END|FINE|TERMINA(RE)?|CHIUDI)$/i.test(option.goTo.trim()),
      ),
  );
  if (usesScreenOut) {
    screenOutGroup.add(
      bot.textBubble(pipe(spec.screenOutText ?? labels.screenOut)),
    );
    saveCheckpoint(screenOutGroup, "SCREENOUT", "CHIUSO - SCREEN-OUT");
  }

  const builtBot = bot.build({
    startTarget: airtable ? setupGroup.start() : prepareGroup.start(),
  });

  return {
    typebot: {
      version: "6" as const,
      name: spec.title.trim() || "Questionario",
      ...builtBot,
      theme: {},
      settings: {},
    },
    warnings,
  };
};

const isOpen = (question: QuestionnaireQuestion) =>
  question.type === "open" || question.type === "openLong";

const buildQuestionBlocks = ({
  question,
  bot,
  labels,
  pipe,
}: {
  question: QuestionnaireQuestion;
  bot: ReturnType<typeof createBotBuilder>;
  labels: BotLabels;
  pipe: (text: string) => string;
}): BotBlock[] => {
  const variableId =
    question.type === "info" || question.type === "continue"
      ? undefined
      : bot.variable(question.code);
  const text = pipe(question.text);
  const instructions = question.instructions
    ? pipe(question.instructions)
    : undefined;
  const questionBubble = () => bot.textBubble(text, instructions);
  const fullText = instructions ? `${text}\n${instructions}` : text;
  const rows = question.rows.map((row) => ({
    id: createId(),
    label: row.label,
    value: row.code,
  }));

  switch (question.type) {
    case "info":
      return [questionBubble()];
    case "continue":
      return [];
    case "single":
    case "multiple":
      return [
        questionBubble(),
        {
          id: createId(),
          type: InputBlockType.CHOICE,
          items: question.options.map((option) => ({
            id: createId(),
            content: option.label,
            value: option.code,
            ...(option.isExclusive ? { isExclusive: true } : {}),
            ...(option.isOther
              ? { hasTextInput: true, textInputRequired: true }
              : {}),
          })),
          options: {
            variableId,
            isMultipleChoice: question.type === "multiple",
            buttonLabel: labels.send,
            ...(question.maxSelections
              ? { maxSelections: question.maxSelections }
              : {}),
            ...(question.isRandomized ? { areItemsRandomized: true } : {}),
          },
        },
      ];
    case "open":
    case "openLong":
      return [
        questionBubble(),
        {
          id: createId(),
          type: InputBlockType.TEXT,
          options: {
            variableId,
            isLong: question.type === "openLong",
            labels: {
              placeholder:
                question.media === "voice"
                  ? labels.typeOrSpeak
                  : labels.typeAnswer,
              button: labels.send,
            },
            ...(question.media === "voice"
              ? {
                  audioClip: {
                    isEnabled: true,
                    saveVariableId: bot.variable(`${question.code}_URL`),
                    visibility: "Public",
                  },
                }
              : {}),
            ...(question.media === "video"
              ? {
                  videoClip: {
                    isEnabled: true,
                    saveVariableId: bot.variable(`${question.code}_VIDEO`),
                    visibility: "Public",
                    maxDurationSeconds: 120,
                    allowFileUpload: true,
                  },
                }
              : {}),
          },
        },
      ];
    case "number":
      return [
        questionBubble(),
        {
          id: createId(),
          type: InputBlockType.NUMBER,
          options: {
            variableId,
            ...(question.scale
              ? { min: question.scale.min, max: question.scale.max }
              : {}),
            labels: { placeholder: labels.typeNumber, button: labels.send },
          },
        },
      ];
    case "rating": {
      const min = question.scale?.min ?? 0;
      const max = question.scale?.max ?? 10;
      return [
        questionBubble(),
        {
          id: createId(),
          type: InputBlockType.RATING,
          options: {
            variableId,
            buttonType: "Numbers",
            startsAt: min,
            length: Math.max(2, max - min + 1),
            labels: {
              left: question.scale?.minLabel ?? undefined,
              right: question.scale?.maxLabel ?? undefined,
              button: labels.send,
            },
            isOneClickSubmitEnabled: true,
          },
        },
      ];
    }
    case "matrix":
      return [
        {
          id: createId(),
          type: InputBlockType.MATRIX,
          options: {
            variableId,
            question: fullText,
            rows,
            columns: question.options.map((option) => ({
              id: createId(),
              label: option.label,
              value: option.code,
            })),
            answerMode: "single",
            ...(question.isRandomized ? { areRowsRandomized: true } : {}),
            buttonLabel: labels.send,
          },
        },
      ];
    case "slider":
      return [
        {
          id: createId(),
          type: InputBlockType.SLIDER,
          options: {
            variableId,
            question: fullText,
            rows,
            min: question.scale?.min ?? -100,
            max: question.scale?.max ?? 100,
            minLabel: question.scale?.minLabel ?? undefined,
            maxLabel: question.scale?.maxLabel ?? undefined,
            ...(question.isRandomized ? { areRowsRandomized: true } : {}),
            buttonLabel: labels.send,
          },
        },
      ];
    case "constantSum":
      return [
        {
          id: createId(),
          type: InputBlockType.CONSTANT_SUM,
          options: {
            variableId,
            question: fullText,
            items: rows,
            total: question.total ?? 100,
            ...(question.isRandomized ? { areItemsRandomized: true } : {}),
            buttonLabel: labels.send,
          },
        },
      ];
    case "signature":
      return [
        {
          id: createId(),
          type: InputBlockType.SIGNATURE,
          options: { variableId, question: fullText, buttonLabel: labels.send },
        },
      ];
    case "photo":
      return [
        {
          id: createId(),
          type: InputBlockType.PHOTO,
          options: {
            variableId,
            question: fullText,
            buttonLabel: labels.send,
            maxPhotos: Math.min(
              maxPhotosLimit,
              Math.max(1, Math.round(question.maxSelections ?? 1)),
            ),
          },
        },
      ];
    case "email":
    case "phone":
    case "date":
      return [
        questionBubble(),
        {
          id: createId(),
          type:
            question.type === "email"
              ? InputBlockType.EMAIL
              : question.type === "phone"
                ? InputBlockType.PHONE
                : InputBlockType.DATE,
          options: { variableId },
        },
      ];
  }
};

/**
 * Voice answer: GPT writes the transcription to its own field
 * (CODE_TRASCRIZIONE, results and Airtable) and the answer variable takes the
 * transcribed text, so AI follow-ups and piping read words, not an audio link.
 * Typed answers are kept as they are and leave CODE_TRASCRIZIONE empty.
 */
const addTranscription = (
  group: GroupBuilder,
  {
    bot,
    credentialsId,
    audioUrlVariable,
    resultVariable,
  }: {
    bot: ReturnType<typeof createBotBuilder>;
    credentialsId: string;
    audioUrlVariable: string;
    resultVariable: string;
  },
) => {
  const afterTranscription = { position: -1 };
  const transcriptionVariable = `${resultVariable}_TRASCRIZIONE`;
  group.add(
    bot.condition([
      {
        content: isEmpty(bot.variable(audioUrlVariable)),
        to: () => group.at(afterTranscription.position)(),
      },
    ]),
    bot.transcription({
      credentialsId,
      audioUrlVariable,
      resultVariable: transcriptionVariable,
    }),
    // A failed transcription leaves the answer as it was.
    bot.setVariable(
      resultVariable,
      `return {{${transcriptionVariable}}} || {{${resultVariable}}}`,
    ),
  );
  afterTranscription.position = group.mark();
};

/**
 * Photo question with an AI check and/or a description instead of the photo:
 *   CODE_MODO       Foto / Descrizione (when describing is allowed)
 *   CODE            the photo links
 *   CODE_FOTO_OK    Sì / No: the AI sees what was asked (a failed check counts as Sì)
 *   CODE_PRODOTTI_FOTO  what the AI recognizes in the photo
 *   CODE_DESCRIZIONE    the description, written or by voice (+ _URL, _TRASCRIZIONE)
 * A photo that doesn't show what was asked can be replaced (or described);
 * after the second one the interview goes on.
 */
const addCheckedPhotoQuestion = (
  group: GroupBuilder,
  {
    bot,
    labels,
    question,
    photo,
    pipe,
    credentialsId,
    failTarget,
  }: {
    bot: ReturnType<typeof createBotBuilder>;
    labels: BotLabels;
    question: QuestionnaireQuestion;
    photo: NonNullable<QuestionnaireQuestion["photo"]>;
    pipe: (text: string) => string;
    credentialsId: string | undefined;
    /** Where the second failed photo leads (counter reset for next time). */
    failTarget: LazyTarget | undefined;
  },
) => {
  const { code } = question;
  const text = pipe(question.text);
  const instructions = question.instructions
    ? pipe(question.instructions)
    : undefined;
  const photoPosition = { value: -1 };
  const continuePosition = { value: -1 };
  const toPhoto: LazyTarget = () => group.at(photoPosition.value)();
  const toContinue: LazyTarget = () => group.at(continuePosition.value)();
  const descriptionGroup = photo.allowDescription
    ? bot.createGroup(`${code} DESCRIZIONE`)
    : undefined;
  const isChecked = Boolean(photo.check && credentialsId);
  const retryGroup = isChecked
    ? bot.createGroup(`${code} FOTO NON RICONOSCIUTA`)
    : undefined;

  if (descriptionGroup)
    group.add(
      bot.textBubble(text, instructions),
      bot.buttons(
        [
          { label: labels.photoChoice, value: "Foto", to: toPhoto },
          {
            label: labels.describeChoice,
            value: "Descrizione",
            to: descriptionGroup.start(),
          },
        ],
        `${code}_MODO`,
      ),
    );
  photoPosition.value = group.mark();
  group.add({
    id: createId(),
    type: InputBlockType.PHOTO,
    options: {
      variableId: bot.variable(code),
      question: descriptionGroup
        ? labels.photoPrompt
        : instructions
          ? `${text}\n${instructions}`
          : text,
      buttonLabel: labels.send,
      source: "cameraOrGallery",
      maxPhotos: Math.min(
        maxPhotosLimit,
        Math.max(1, Math.round(question.maxSelections ?? 1)),
      ),
    },
  });
  if (isChecked && retryGroup && credentialsId) {
    const check = photo.check ?? "";
    group.add(
      bot.setVariable(
        `${code}_TENTATIVI`,
        `return Number({{${code}_TENTATIVI}} || 0) + 1`,
      ),
      bot.textBubble(labels.checkingPhoto),
      bot.setVariable(
        `${code}_FOTO_JSON`,
        `return JSON.stringify(String({{${code}}} || "").split(/,\\s*/).filter(Boolean))`,
      ),
      bot.lookAtImages({
        credentialsId,
        system: `You check photos sent by respondents of a market research interview. The photo must show: ${check}.
Look at the images and answer on one line, in the language of that description:
"SI | <the products / packs you recognize, brand and name when readable>" when the photo shows it,
"NO | <what the photo shows instead>" otherwise (people, documents, blurry or unrelated pictures).
Nothing else.`,
        user: photo.referenceImageUrl
          ? `La foto deve mostrare: ${check}\nPrima immagine: il riferimento (quello che va trovato). Le immagini dopo: la foto del rispondente. Rispondi SI se la foto mostra almeno uno degli elementi del riferimento.\n\n${photo.referenceImageUrl}\n\n{{${code}_FOTO_JSON}}`
          : `La foto deve mostrare: ${check}\n\n{{${code}_FOTO_JSON}}`,
        resultVariable: `${code}_FOTO_AI`,
      }),
      // No answer from the AI never blocks the respondent.
      bot.setVariable(
        `${code}_FOTO_OK`,
        `return /^\\s*NO\\b/i.test(String({{${code}_FOTO_AI}} || "")) ? "No" : "Sì"`,
      ),
      bot.setVariable(
        `${code}_PRODOTTI_FOTO`,
        `return String({{${code}_FOTO_AI}} || "").split("|").slice(1).join("|").trim()`,
      ),
      bot.condition([
        {
          content: equals(bot.variable(`${code}_FOTO_OK`), "No"),
          to: retryGroup.start(),
        },
      ]),
    );
    const failGroup = failTarget
      ? bot
          .createGroup(`${code} FOTO NON VALIDA - RITORNO`)
          .add(bot.setVariable(`${code}_TENTATIVI`, "return 0"))
          .setNext(failTarget)
      : undefined;
    retryGroup.add(
      bot.condition([
        {
          content: comparison(
            bot.variable(`${code}_TENTATIVI`),
            ComparisonOperators.GREATER_OR_EQUAL,
            "2",
          ),
          to: failGroup?.start() ?? descriptionGroup?.start() ?? toContinue,
        },
      ]),
      bot.textBubble(labels.photoNotRecognized),
      bot.buttons(
        [
          { label: labels.retryPhoto, value: "Foto", to: toPhoto },
          ...(descriptionGroup
            ? [
                {
                  label: labels.describeChoice,
                  value: "Descrizione",
                  to: descriptionGroup.start(),
                },
              ]
            : []),
        ],
        `${code}_MODO`,
      ),
    );
  }
  if (descriptionGroup) {
    const answerVariable = `${code}_DESCRIZIONE`;
    descriptionGroup.add(
      bot.textBubble(
        photo.describePrompt
          ? pipe(photo.describePrompt)
          : labels.describePrompt,
      ),
      {
        id: createId(),
        type: InputBlockType.TEXT,
        options: {
          variableId: bot.variable(answerVariable),
          isLong: true,
          labels: { placeholder: labels.typeOrSpeak, button: labels.send },
          audioClip: {
            isEnabled: true,
            saveVariableId: bot.variable(`${answerVariable}_URL`),
            visibility: "Public",
          },
        },
      },
    );
    if (credentialsId)
      addTranscription(descriptionGroup, {
        bot,
        credentialsId,
        audioUrlVariable: `${answerVariable}_URL`,
        resultVariable: answerVariable,
      });
    descriptionGroup.setNext(toContinue);
  }
  continuePosition.value = group.mark();
};

/**
 * Stimulus before the question. Videos must be watched (90%, no skipping
 * ahead, watched share in CODE_VISIONE); with replay the respondent may watch
 * once more, recorded in CODE_RIVISTO (Sì / No).
 */
const addStimulus = (
  group: GroupBuilder,
  {
    bot,
    labels,
    stimulus,
    code,
  }: {
    bot: ReturnType<typeof createBotBuilder>;
    labels: BotLabels;
    stimulus: QuestionnaireStimulus;
    code: string;
  },
) => {
  const url = stimulus.url ? { url: stimulus.url } : {};
  if (stimulus.type === "image") {
    group.add({ id: createId(), type: BubbleBlockType.IMAGE, content: url });
    return;
  }
  const video = (watchTracking: Record<string, unknown>): BotBlock => ({
    id: createId(),
    type: BubbleBlockType.VIDEO,
    content: { ...url, watchTracking },
  });
  group.add(
    video({
      isEnabled: true,
      isRequired: true,
      minimumWatchPercentage: 90,
      allowSeeking: false,
      autoContinueOnEnd: stimulus.allowReplay,
      variableId: bot.variable(`${code}_VISIONE`),
      buttonLabel: labels.continue,
    }),
  );
  if (!stimulus.allowReplay) return;
  const afterReplay = { position: -1 };
  const replayGroup = bot.createGroup(`${code} · rivede il video`);
  replayGroup
    .add(
      video({
        isEnabled: true,
        isRequired: false,
        allowSeeking: true,
        variableId: bot.variable(`${code}_VISIONE_BIS`),
        buttonLabel: labels.continue,
      }),
    )
    .setNext(() => group.at(afterReplay.position)());
  group.add(
    bot.buttons(
      [
        { label: labels.replay, value: "Sì", to: replayGroup.start() },
        { label: labels.continue, value: "No" },
      ],
      `${code}_RIVISTO`,
    ),
  );
  afterReplay.position = group.mark();
};

/**
 * AI follow-ups ("rilanci"): up to N rounds, each one asks about what is still
 * missing or answers 🏁, which ends the follow-ups.
 */
const addFollowUps = (
  group: GroupBuilder,
  {
    bot,
    question,
    credentialsId,
    labels,
    spec,
    pipe,
    saveSummary,
  }: {
    bot: ReturnType<typeof createBotBuilder>;
    question: QuestionnaireQuestion;
    credentialsId: string;
    labels: BotLabels;
    spec: QuestionnaireSpec;
    pipe: (text: string) => string;
    saveSummary: boolean;
  },
) => {
  const probe = question.probe;
  if (!probe) return;
  const rounds = Math.min(3, Math.max(1, probe.maxFollowUps));
  const afterFollowUps = { position: -1 };
  const followUps: { asked: string; answer: string }[] = [];
  for (let round = 1; round <= rounds; round++) {
    const askedVariable = `${question.code}_AI${round}`;
    const answerVariable = `${question.code}_R${round}`;
    group.add(
      bot.textBubble(labels.thinking),
      bot.generateText({
        credentialsId,
        prompt: buildProbePrompt({
          questionText: pipe(question.text),
          elements: probe.elements,
          addressForm: spec.addressForm,
          language: spec.language,
          round,
          maxRounds: rounds,
          answer: `{{${question.code}}}`,
          followUps,
        }),
        resultVariable: askedVariable,
        description:
          "Il messaggio di approfondimento per il rispondente, oppure solo 🏁.",
      }),
      bot.condition([
        {
          content: {
            logicalOperator: LogicalOperator.AND,
            comparisons: [
              {
                id: createId(),
                variableId: bot.variable(askedVariable),
                comparisonOperator: ComparisonOperators.CONTAINS,
                value: "🏁",
              },
            ],
          },
          to: () => group.at(afterFollowUps.position)(),
        },
      ]),
      bot.textBubble(`{{${askedVariable}}}`),
      {
        id: createId(),
        type: InputBlockType.TEXT,
        options: {
          variableId: bot.variable(answerVariable),
          isLong: true,
          labels: {
            placeholder:
              question.media === "voice"
                ? labels.typeOrSpeak
                : labels.typeAnswer,
            button: labels.send,
          },
          ...(question.media === "voice"
            ? {
                audioClip: {
                  isEnabled: true,
                  saveVariableId: bot.variable(`${answerVariable}_URL`),
                  visibility: "Public",
                },
              }
            : {}),
        },
      },
    );
    if (question.media === "voice")
      addTranscription(group, {
        bot,
        credentialsId,
        audioUrlVariable: `${answerVariable}_URL`,
        resultVariable: answerVariable,
      });
    followUps.push({
      asked: `{{${askedVariable}}}`,
      answer: `{{${answerVariable}}}`,
    });
  }
  afterFollowUps.position = group.mark();
  if (saveSummary) {
    const pairs = Array.from({ length: rounds }, (_, index) => {
      const round = index + 1;
      return `[{{${question.code}_AI${round}}}, {{${question.code}_R${round}}}]`;
    });
    group.add(
      bot.setVariable(
        `${question.code}_RILANCI`,
        `[${pairs.join(", ")}].filter(([asked]) => asked && !String(asked).includes("🏁")).map(([asked, answer]) => "Rilancio: " + asked + "\\nRisposta: " + (answer ?? "")).join("\\n\\n")`,
      ),
    );
  }
};

const createConditionTranslator = ({
  bot,
  questionByCode,
  warnings,
}: {
  bot: ReturnType<typeof createBotBuilder>;
  questionByCode: Map<string, QuestionnaireQuestion>;
  warnings: string[];
}) => {
  const variableIdOf = (name: string) =>
    bot.hasVariable(name) ? bot.variable(name) : undefined;

  const toItem = (
    condition: QuestionnaireCondition,
    isNegated: boolean,
  ): ConditionItem | undefined => {
    const variableId = variableIdOf(condition.questionCode);
    if (!variableId) return undefined;
    const isList =
      questionByCode.get(condition.questionCode)?.type === "multiple";
    // anyOf: the answer is one of the codes; noneOf: it isn't.
    const isMatch = (condition.operator === "anyOf") !== isNegated;
    if (
      condition.operator === "lessThan" ||
      condition.operator === "greaterThan"
    ) {
      const value = condition.values[0] ?? "";
      const isLess = (condition.operator === "lessThan") !== isNegated;
      const operator = isNegated
        ? isLess
          ? ComparisonOperators.LESS_OR_EQUAL
          : ComparisonOperators.GREATER_OR_EQUAL
        : isLess
          ? ComparisonOperators.LESS
          : ComparisonOperators.GREATER;
      return {
        logicalOperator: LogicalOperator.AND,
        comparisons: [
          { id: createId(), variableId, comparisonOperator: operator, value },
        ],
      };
    }
    // Multiple choice answers are saved as "1, 3": codes are matched as whole
    // items of the list ("1" never matches "11").
    const matchOperator = isList
      ? ComparisonOperators.MATCHES_REGEX
      : ComparisonOperators.EQUAL;
    const noMatchOperator = isList
      ? ComparisonOperators.NOT_MATCH_REGEX
      : ComparisonOperators.NOT_EQUAL;
    return {
      // "one of these codes" is an OR of equalities, its negation an AND.
      logicalOperator: isMatch ? LogicalOperator.OR : LogicalOperator.AND,
      comparisons: condition.values.map((value) => ({
        id: createId(),
        variableId,
        comparisonOperator: isMatch ? matchOperator : noMatchOperator,
        value: isList ? toListItemPattern(value) : value,
      })),
    };
  };

  return {
    /** Skips also when the filtering question wasn't answered (it was itself filtered out). */
    unansweredItems: (group: QuestionnaireConditionGroup): ConditionItem[] =>
      group.logic === "all" || group.conditions.length === 1
        ? group.conditions.flatMap((condition) => {
            const variableId = variableIdOf(condition.questionCode);
            return variableId ? [isEmpty(variableId)] : [];
          })
        : [],
    /** Condition items, any of which is true when `group` is true (or false when negated). */
    toItems: (
      group: QuestionnaireConditionGroup,
      isNegated: boolean,
      questionCode: string,
    ): ConditionItem[] => {
      const items = group.conditions.map((condition) =>
        toItem(condition, isNegated),
      );
      if (items.some((item) => !item)) {
        warnings.push(
          `${questionCode}: una condizione si riferisce a una domanda o variabile che non esiste ed è stata ignorata.`,
        );
        return [];
      }
      const definedItems = items.filter((item) => item !== undefined);
      // all ↔ any when negated (De Morgan).
      const isDisjunction = (group.logic === "any") !== isNegated;
      if (isDisjunction || definedItems.length <= 1) return definedItems;
      const canMergeAsAnd = definedItems.every(
        (item) =>
          item.logicalOperator === LogicalOperator.AND ||
          item.comparisons.length <= 1,
      );
      if (!canMergeAsAnd) {
        warnings.push(
          `${questionCode}: il filtro è troppo complesso per una sola condizione, controllalo nell'editor.`,
        );
        return [];
      }
      return [
        {
          logicalOperator: LogicalOperator.AND,
          comparisons: definedItems.flatMap((item) => item.comparisons),
        },
      ];
    },
  };
};

const comparison = (
  variableId: string,
  comparisonOperator: ComparisonOperators,
  value = "",
): ConditionItem => ({
  logicalOperator: LogicalOperator.AND,
  comparisons: [{ id: createId(), variableId, comparisonOperator, value }],
});
const isEmpty = (variableId: string) =>
  comparison(variableId, ComparisonOperators.IS_EMPTY);
const isSet = (variableId: string) =>
  comparison(variableId, ComparisonOperators.IS_SET);
const equals = (variableId: string, value: string) =>
  comparison(variableId, ComparisonOperators.EQUAL, value);

/** Variables kept in the Airtable "Stato" field to restore the answers on resume. */
const savedVariablesOf = (
  question: QuestionnaireQuestion,
  labelledCodes: Set<string>,
) => [
  question.code,
  ...(labelledCodes.has(question.code) ? [`${question.code}_TESTO`] : []),
];

/** Airtable columns written after a question (one per question code). */
const airtableFieldsOf = (
  question: QuestionnaireQuestion,
  labelledCodes: Set<string>,
): Record<string, string> => ({
  [question.code]: labelledCodes.has(question.code)
    ? `{{${question.code}_TESTO}}`
    : `{{${question.code}}}`,
  ...(isOpen(question) && question.media === "voice"
    ? {
        [`${question.code}_URL`]: `{{${question.code}_URL}}`,
        [`${question.code}_TRASCRIZIONE`]: `{{${question.code}_TRASCRIZIONE}}`,
      }
    : {}),
  ...(isOpen(question) && question.media === "video"
    ? { [`${question.code}_VIDEO`]: `{{${question.code}_VIDEO}}` }
    : {}),
  ...(isOpen(question) && question.probe
    ? { [`${question.code}_RILANCI`]: `{{${question.code}_RILANCI}}` }
    : {}),
});

const airtableColumnsNote = (
  airtable: QuestionnaireAirtable,
  questions: QuestionnaireQuestion[],
  spec: QuestionnaireSpec,
) => {
  const columns = [
    airtable.lookupField,
    "Status",
    "Checkpoint",
    "Stato",
    ...(spec.privacyUrl ? ["Privacy"] : []),
    ...airtable.loadFields.map((field) => field.airtableField),
    ...questions
      .filter(
        (question) => question.type !== "info" && question.type !== "continue",
      )
      .flatMap((question) =>
        Object.keys(airtableFieldsOf(question, new Set())),
      ),
  ];
  return `Airtable: incolla il token nel blocco "auth_airtable" del gruppo "SETTA SPECIFICHE AIRTABLE" e crea nella tabella questi campi di testo: ${[...new Set(columns)].join(", ")}.`;
};

/**
 * Labels of a choice answer ("1, 3" → "Aereo, Nave") or of a grid answer
 * ({"1": 2} → "Statement: Column" lines).
 */
const labelExpression = (question: QuestionnaireQuestion) => {
  const optionLabels = Object.fromEntries(
    question.options.map((option) => [option.code, option.label]),
  );
  if (question.type === "matrix") {
    const rowLabels = Object.fromEntries(
      question.rows.map((row) => [row.code, row.label]),
    );
    return `((value) => { const rows = ${JSON.stringify(rowLabels)}; const columns = ${JSON.stringify(optionLabels)}; let answers = {}; try { answers = typeof value === "string" ? JSON.parse(value || "{}") : (value ?? {}); } catch (error) { return String(value ?? ""); } return Object.entries(answers).map(([row, column]) => (rows[row] ?? row) + ": " + [].concat(column).map((code) => columns[String(code)] ?? code).join(", ")).join("\n"); })({{${question.code}}})`;
  }
  return `((value) => { const labels = ${JSON.stringify(optionLabels)}; return String(value ?? "").split(",").map((code) => code.trim()).filter(Boolean).map((code) => labels[code] ?? code).join(", "); })({{${question.code}}})`;
};

/** JSON of the answers so far, updated after each question ("Stato" field). */
const stateUpdateExpression = (variables: [string, string][]) =>
  `((state, values) => { let saved = {}; try { saved = typeof state === "string" ? JSON.parse(state || "{}") : (state ?? {}); } catch (error) {} const entries = Object.entries(values).filter(([, value]) => value !== undefined && value !== null).map(([key, value]) => [key, Array.isArray(value) ? value.map(String) : String(value)]); return JSON.stringify({ ...saved, ...Object.fromEntries(entries) }); })({{stato_json}}, { ${variables
    .map(([name]) => `${JSON.stringify(name)}: {{${name}}}`)
    .join(", ")} })`;

const restoreExpression = (name: string) =>
  `((state) => { try { const saved = typeof state === "string" ? JSON.parse(state || "{}") : (state ?? {}); const value = saved[${JSON.stringify(name)}]; return value === undefined || value === null ? undefined : value; } catch (error) { return undefined; } })({{stato_json}})`;

const computedVariableExpression = (
  computed: QuestionnaireSpec["computedVariables"][number],
) => {
  const cases = Object.fromEntries(
    computed.cases.map((item) => [
      item.whenValue.trim().toUpperCase(),
      item.text,
    ]),
  );
  return `((value) => { const cases = ${JSON.stringify(cases)}; const key = String(value ?? "").trim().toUpperCase(); return Object.prototype.hasOwnProperty.call(cases, key) ? cases[key] : ${JSON.stringify(computed.defaultText)}; })({{${computed.sourceVariable}}})`;
};

const toListItemPattern = (code: string) =>
  `(^|,\\s*)${code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s*,|$)`;

/** Codes are variable and column names: unique, letters / numbers / _ only. */
const deduplicateCodes = (questions: QuestionnaireQuestion[]) => {
  const usedCodes = new Set<string>();
  return questions.map((question, index) => {
    const baseCode =
      question.code
        .trim()
        .replace(/[^\p{L}\p{N}_]+/gu, "_")
        .replace(/^_+|_+$/g, "") || `Q${index + 1}`;
    let code = /^\p{N}/u.test(baseCode) ? `Q${baseCode}` : baseCode;
    for (let suffix = 2; usedCodes.has(code); suffix++)
      code = `${baseCode}_${suffix}`;
    usedCodes.add(code);
    return code === question.code ? question : { ...question, code };
  });
};
