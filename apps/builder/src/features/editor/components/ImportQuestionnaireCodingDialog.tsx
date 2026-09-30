import { createId } from "@paralleldrive/cuid2";
import { useTranslate } from "@tolgee/react";
import { applyQuestionnaireCoding } from "@typebot.io/results/research/wordCoding/applyQuestionnaireCoding";
import {
  type CodingProposal,
  type CodingStatus,
  matchOptions,
  matchQuestionnaireCoding,
  type OptionMapping,
  type QuestionMapping,
  type TypebotCodingQuestion,
} from "@typebot.io/results/research/wordCoding/matchQuestionnaireCoding";
import { parseDocxQuestionnaire } from "@typebot.io/results/research/wordCoding/parseDocxQuestionnaire";
import { Alert } from "@typebot.io/ui/components/Alert";
import { Badge } from "@typebot.io/ui/components/Badge";
import { Button, buttonVariants } from "@typebot.io/ui/components/Button";
import { Checkbox } from "@typebot.io/ui/components/Checkbox";
import { Dialog } from "@typebot.io/ui/components/Dialog";
import { Field } from "@typebot.io/ui/components/Field";
import { Switch } from "@typebot.io/ui/components/Switch";
import { useId, useMemo, useState } from "react";
import { BasicSelect } from "@/components/inputs/BasicSelect";
import { toast } from "@/lib/toast";
import { useTypebot } from "../providers/TypebotProvider";

type Props = {
  isOpen: boolean;
  onClose: () => void;
};

const ignoreValue = "__ignore__";

/**
 * "Import questionnaire coding": reads a Word .docx, proposes a mapping between
 * its questions / codes and the flow, lets the user accept, change or ignore each
 * match and applies the reviewed codes to the draft only (labels untouched).
 */
export const ImportQuestionnaireCodingDialog = ({ isOpen, onClose }: Props) => {
  const { t } = useTranslate();
  const { typebot, updateTypebot } = useTypebot();
  const [proposal, setProposal] = useState<CodingProposal>();
  const [fileName, setFileName] = useState<string>();
  const [isParsing, setIsParsing] = useState(false);
  const fileInputId = useId();

  const preview = useMemo(
    () =>
      typebot && proposal
        ? applyQuestionnaireCoding(typebot, proposal, {
            createVariableId: () => "preview",
          })
        : undefined,
    [typebot, proposal],
  );

  if (!typebot) return null;

  const readFile = async (file: File) => {
    setIsParsing(true);
    try {
      const { questions } = await parseDocxQuestionnaire(
        new Uint8Array(await file.arrayBuffer()),
      );
      if (questions.length === 0)
        toast({ description: t("editor.coding.import.noQuestions") });
      setFileName(file.name);
      setProposal(matchQuestionnaireCoding(questions, typebot));
    } catch (error) {
      toast({
        description:
          error instanceof Error
            ? error.message
            : t("editor.coding.import.readError"),
      });
    } finally {
      setIsParsing(false);
    }
  };

  const updateQuestionMapping = (
    index: number,
    updates: Partial<QuestionMapping>,
  ) =>
    setProposal((currentProposal) =>
      currentProposal
        ? {
            ...currentProposal,
            questions: currentProposal.questions.map((mapping, mappingIndex) =>
              mappingIndex === index ? { ...mapping, ...updates } : mapping,
            ),
          }
        : currentProposal,
    );

  const changeTypebotQuestion = (index: number, blockId: string) => {
    const mapping = proposal?.questions[index];
    if (!mapping || !proposal) return;
    if (blockId === ignoreValue)
      return updateQuestionMapping(index, { isIgnored: true });
    const typebotQuestion = proposal.typebotQuestions.find(
      (question) => question.blockId === blockId,
    );
    if (!typebotQuestion) return;
    updateQuestionMapping(index, {
      blockId,
      isIgnored: false,
      // A match chosen by hand is a confirmed match.
      isConfirmed: true,
      shouldSetVariableName: !typebotQuestion.variableName,
      options: matchOptions(mapping.wordQuestion, typebotQuestion),
    });
  };

  const apply = async () => {
    if (!proposal) return;
    const result = applyQuestionnaireCoding(typebot, proposal, {
      createVariableId: () => createId(),
    });
    await updateTypebot({
      updates: { groups: result.groups, variables: result.variables },
      save: true,
    });
    toast({
      type: "success",
      description: t("editor.coding.import.applied", {
        count: result.changes.length,
      }),
    });
    for (const warning of result.warnings) toast({ description: warning });
    setProposal(undefined);
    setFileName(undefined);
    onClose();
  };

  const counts = proposal ? countStatuses(proposal) : undefined;

  return (
    <Dialog.Root isOpen={isOpen} onClose={onClose}>
      <Dialog.Popup className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <Dialog.Title>{t("editor.coding.import.title")}</Dialog.Title>
        <Dialog.CloseButton />
        <p className="text-sm text-gray-11">
          {t("editor.coding.import.description")}
        </p>
        <div className="flex items-center gap-2">
          <input
            id={fileInputId}
            type="file"
            className="hidden"
            accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) readFile(file);
              event.target.value = "";
            }}
          />
          <label
            htmlFor={fileInputId}
            aria-disabled={isParsing}
            className={buttonVariants({ variant: "secondary", size: "sm" })}
          >
            {t("editor.coding.import.chooseFile")}
          </label>
          {fileName && <span className="text-sm text-gray-10">{fileName}</span>}
        </div>

        {proposal && counts && (
          <>
            <div className="flex flex-wrap gap-2">
              {statusOrder.map((status) => (
                <Badge key={status} colorScheme={statusColors[status]}>
                  {status.replaceAll("_", " ")}: {counts[status]}
                </Badge>
              ))}
            </div>
            <div className="flex flex-col gap-3">
              {proposal.questions.map((mapping, index) => (
                <QuestionMappingCard
                  key={`${mapping.wordQuestion.index}`}
                  mapping={mapping}
                  typebotQuestions={proposal.typebotQuestions}
                  onTypebotQuestionChange={(blockId) =>
                    changeTypebotQuestion(index, blockId)
                  }
                  onMappingChange={(updates) =>
                    updateQuestionMapping(index, updates)
                  }
                />
              ))}
            </div>
            {proposal.missingInWord.length > 0 && (
              <Alert.Root variant="info">
                <Alert.Description>
                  <p className="font-medium">MISSING IN WORD</p>
                  {proposal.missingInWord.map((question) => (
                    <p key={question.blockId}>
                      {formatTypebotQuestion(question)}
                    </p>
                  ))}
                </Alert.Description>
              </Alert.Root>
            )}
            {preview && (
              <div className="rounded-md border border-gray-6 p-3 text-sm">
                <p className="font-medium">
                  {t("editor.coding.import.changes", {
                    count: preview.changes.length,
                  })}
                </p>
                <ul className="max-h-40 overflow-y-auto text-gray-11">
                  {preview.changes.map((change) => (
                    <li key={`${change.blockId}-${change.description}`}>
                      {change.description}
                    </li>
                  ))}
                </ul>
                {preview.warnings.map((warning) => (
                  <p key={warning} className="text-coral-10">
                    {warning}
                  </p>
                ))}
              </div>
            )}
          </>
        )}
        <Dialog.Footer>
          <Button variant="secondary" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button
            disabled={!preview || preview.changes.length === 0}
            onClick={apply}
          >
            {t("editor.coding.import.apply")}
          </Button>
        </Dialog.Footer>
      </Dialog.Popup>
    </Dialog.Root>
  );
};

const QuestionMappingCard = ({
  mapping,
  typebotQuestions,
  onTypebotQuestionChange,
  onMappingChange,
}: {
  mapping: QuestionMapping;
  typebotQuestions: TypebotCodingQuestion[];
  onTypebotQuestionChange: (blockId: string) => void;
  onMappingChange: (updates: Partial<QuestionMapping>) => void;
}) => {
  const { t } = useTranslate();
  const typebotQuestion = typebotQuestions.find(
    (question) => question.blockId === mapping.blockId,
  );
  const targets = typebotQuestion
    ? [...typebotQuestion.options, ...typebotQuestion.rows]
    : [];
  const needsConfirmation =
    !mapping.isIgnored &&
    mapping.blockId !== undefined &&
    mapping.status === "AMBIGUOUS";

  const updateOption = (optionIndex: number, updates: Partial<OptionMapping>) =>
    onMappingChange({
      options: mapping.options.map((option, index) =>
        index === optionIndex ? { ...option, ...updates } : option,
      ),
    });

  return (
    <div className="flex flex-col gap-2 rounded-md border border-gray-6 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge colorScheme={statusColors[mapping.status]}>
          {mapping.status.replaceAll("_", " ")}
        </Badge>
        <span className="font-medium">
          {mapping.wordQuestion.variableName} {mapping.wordQuestion.text}
        </span>
        <span className="text-xs text-gray-10">
          ({mapping.wordQuestion.kind}
          {mapping.matchReason ? ` · ${mapping.matchReason}` : ""})
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm">→</span>
        <BasicSelect
          className="min-w-72"
          value={
            mapping.isIgnored ? ignoreValue : (mapping.blockId ?? ignoreValue)
          }
          items={[
            { label: t("editor.coding.import.ignore"), value: ignoreValue },
            ...typebotQuestions.map((question) => ({
              label: formatTypebotQuestion(question),
              value: question.blockId,
            })),
          ]}
          onChange={onTypebotQuestionChange}
        />
        {needsConfirmation && (
          <Field.Root className="flex-row items-center">
            <Checkbox
              checked={mapping.isConfirmed}
              onCheckedChange={(isConfirmed) =>
                onMappingChange({ isConfirmed })
              }
            />
            <Field.Label>{t("editor.coding.import.confirm")}</Field.Label>
          </Field.Root>
        )}
      </div>
      {!mapping.isIgnored && typebotQuestion && (
        <>
          <div className="flex flex-wrap gap-4">
            <Field.Root className="flex-row items-center">
              <Switch
                checked={mapping.shouldSetVariableName}
                onCheckedChange={(shouldSetVariableName) =>
                  onMappingChange({ shouldSetVariableName })
                }
              />
              <Field.Label>
                {t("editor.coding.import.setVariableName", {
                  name: mapping.wordQuestion.variableName,
                })}
              </Field.Label>
            </Field.Root>
            <Field.Root className="flex-row items-center">
              <Switch
                checked={mapping.shouldApplyDeclaredProperties}
                onCheckedChange={(shouldApplyDeclaredProperties) =>
                  onMappingChange({ shouldApplyDeclaredProperties })
                }
              />
              <Field.Label>
                {t("editor.coding.import.applyDeclared")}
              </Field.Label>
            </Field.Root>
          </div>
          {mapping.options.length > 0 && (
            <table className="w-full text-sm">
              <thead className="text-left text-gray-10">
                <tr>
                  <th className="font-normal">Word label</th>
                  <th className="font-normal">Word code</th>
                  <th className="font-normal">Typebot label</th>
                  <th className="font-normal">Typebot value</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {mapping.options.map((option, optionIndex) => {
                  const target = targets.find(
                    (target) =>
                      target.kind === option.targetKind &&
                      target.id === option.targetId,
                  );
                  const kindTargets = targets.filter(
                    (target) => target.kind === option.targetKind,
                  );
                  return (
                    <tr
                      key={`${option.targetKind}-${option.wordOption?.code ?? "none"}-${option.targetId ?? "none"}`}
                      className="border-t border-gray-4"
                    >
                      <td>
                        {option.wordOption?.label ?? "—"}
                        {option.targetKind === "row" && (
                          <span className="text-xs text-gray-10"> (row)</span>
                        )}
                      </td>
                      <td>{option.wordOption?.code ?? "—"}</td>
                      <td>
                        {option.wordOption ? (
                          <BasicSelect
                            className="min-w-44"
                            value={
                              option.isIgnored || !option.targetId
                                ? ignoreValue
                                : option.targetId
                            }
                            items={[
                              { label: "—", value: ignoreValue },
                              ...kindTargets.map((kindTarget) => ({
                                label: kindTarget.label || kindTarget.id,
                                value: kindTarget.id,
                              })),
                            ]}
                            onChange={(targetId: string) =>
                              updateOption(
                                optionIndex,
                                targetId === ignoreValue
                                  ? { isIgnored: true }
                                  : {
                                      targetId,
                                      isIgnored: false,
                                      isConfirmed: true,
                                    },
                              )
                            }
                          />
                        ) : (
                          (target?.label ?? "—")
                        )}
                      </td>
                      <td>
                        {target?.value ?? "—"}
                        {option.wordOption &&
                          !option.isIgnored &&
                          target &&
                          target.value !== option.wordOption.code &&
                          ` → ${option.wordOption.code}`}
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
                          <Badge colorScheme={statusColors[option.status]}>
                            {option.status.replaceAll("_", " ")}
                          </Badge>
                          {option.status === "AMBIGUOUS" &&
                            !option.isIgnored && (
                              <Checkbox
                                aria-label={t("editor.coding.import.confirm")}
                                checked={option.isConfirmed}
                                onCheckedChange={(isConfirmed) =>
                                  updateOption(optionIndex, { isConfirmed })
                                }
                              />
                            )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
};

const statusOrder: CodingStatus[] = [
  "MATCHED",
  "UNMATCHED",
  "AMBIGUOUS",
  "MISSING_IN_WORD",
  "MISSING_IN_TYPEBOT",
];

const statusColors = {
  MATCHED: "green",
  UNMATCHED: "orange",
  AMBIGUOUS: "yellow",
  MISSING_IN_WORD: "blue",
  MISSING_IN_TYPEBOT: "red",
} as const satisfies Record<CodingStatus, string>;

const formatTypebotQuestion = (question: TypebotCodingQuestion) =>
  `${question.variableName ?? `#${question.position}`} · ${question.label}`;

/** Questions and options by status (MISSING IN WORD includes unmapped Typebot questions). */
const countStatuses = (proposal: CodingProposal) => {
  const counts: Record<CodingStatus, number> = {
    MATCHED: 0,
    UNMATCHED: 0,
    AMBIGUOUS: 0,
    MISSING_IN_WORD: proposal.missingInWord.length,
    MISSING_IN_TYPEBOT: 0,
  };
  for (const mapping of proposal.questions) {
    counts[mapping.status]++;
    for (const option of mapping.options) counts[option.status]++;
  }
  return counts;
};
