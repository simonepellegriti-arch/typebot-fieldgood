import { useTranslate } from "@tolgee/react";
import { InputBlockType } from "@typebot.io/blocks-inputs/constants";
import {
  defaultLoopOptions,
  maxLoopIterations,
} from "@typebot.io/blocks-logic/loop/constants";
import type {
  LoopBlock,
  LoopOptions,
} from "@typebot.io/blocks-logic/loop/schema";
import { LogicalOperator } from "@typebot.io/conditions/constants";
import type { Condition } from "@typebot.io/conditions/schemas";
import { Alert } from "@typebot.io/ui/components/Alert";
import { DebouncedTextInput } from "@typebot.io/ui/components/DebouncedTextInput";
import { Field } from "@typebot.io/ui/components/Field";
import { MoreInfoTooltip } from "@typebot.io/ui/components/MoreInfoTooltip";
import { Switch } from "@typebot.io/ui/components/Switch";
import type { Variable } from "@typebot.io/variables/schemas";
import { BasicNumberInput } from "@/components/inputs/BasicNumberInput";
import { BasicSelect } from "@/components/inputs/BasicSelect";
import { VariablesCombobox } from "@/components/inputs/VariablesCombobox";
import { ConditionForm } from "@/features/blocks/logic/condition/components/ConditionForm";
import { useTypebot } from "@/features/editor/providers/TypebotProvider";

type Props = {
  blockId: string;
  options: LoopBlock["options"];
  onOptionsChange: (options: LoopBlock["options"]) => void;
};

const emptyCondition: Condition = {
  comparisons: [],
  logicalOperator: LogicalOperator.AND,
};

/**
 * Loop / cycle settings: what to loop on (list variable, answers of a previous
 * question or a number of times), the group asked at each iteration, the
 * iteration variables and the optional break / continue conditions.
 */
export const LoopSettings = ({ blockId, options, onOptionsChange }: Props) => {
  const { t } = useTranslate();
  const { typebot } = useTypebot();
  const updateOptions = (updates: Partial<LoopOptions>) =>
    onOptionsChange({ ...options, ...updates });

  if (!typebot) return null;
  const sourceType = options?.sourceType ?? defaultLoopOptions.sourceType;
  const loopGroupId = typebot.groups.find((group) =>
    group.blocks.some((block) => block.id === blockId),
  )?.id;
  const bodyGroups = typebot.groups.filter((group) => group.id !== loopGroupId);
  const sourceQuestions = typebot.groups.flatMap((group) =>
    group.blocks.flatMap((block, blockIndex) => {
      if (
        block.type !== InputBlockType.CHOICE &&
        block.type !== InputBlockType.PICTURE_CHOICE &&
        block.type !== InputBlockType.MATRIX
      )
        return [];
      const variableName = typebot.variables.find(
        (variable) => variable.id === block.options?.variableId,
      )?.name;
      return [
        {
          label: `${variableName ?? t("blocks.logic.loop.source.noVariable")} · ${group.title} #${blockIndex + 1}`,
          value: block.id,
          hasVariable: variableName !== undefined,
        },
      ];
    }),
  );
  const selectedSourceQuestion = sourceQuestions.find(
    (question) => question.value === options?.sourceBlockId,
  );

  return (
    <div className="flex flex-col gap-4">
      <Field.Root>
        <Field.Label>
          {t("blocks.logic.loop.name")}
          <MoreInfoTooltip>
            {t("blocks.logic.loop.name.helperText")}
          </MoreInfoTooltip>
        </Field.Label>
        <DebouncedTextInput
          defaultValue={options?.name ?? ""}
          placeholder="LOOP_BRAND"
          onValueChange={(name) => updateOptions({ name: name || undefined })}
        />
      </Field.Root>

      <Field.Root>
        <Field.Label>{t("blocks.logic.loop.source")}</Field.Label>
        <BasicSelect
          className="w-full"
          value={sourceType}
          items={[
            {
              label: t("blocks.logic.loop.source.list"),
              value: "list" as const,
            },
            {
              label: t("blocks.logic.loop.source.answers"),
              value: "answers" as const,
            },
            {
              label: t("blocks.logic.loop.source.count"),
              value: "count" as const,
            },
          ]}
          onChange={(sourceType: LoopOptions["sourceType"]) =>
            updateOptions({ sourceType })
          }
        />
      </Field.Root>

      {sourceType === "answers" && (
        <Field.Root>
          <Field.Label>
            {t("blocks.logic.loop.sourceQuestion")}
            <MoreInfoTooltip>
              {t("blocks.logic.loop.sourceQuestion.helperText")}
            </MoreInfoTooltip>
          </Field.Label>
          <BasicSelect
            className="w-full"
            value={options?.sourceBlockId}
            items={sourceQuestions.map(({ label, value }) => ({
              label,
              value,
            }))}
            placeholder={t("blocks.logic.loop.sourceQuestion.placeholder")}
            onChange={(sourceBlockId: string | undefined) =>
              updateOptions({ sourceBlockId })
            }
          />
          {selectedSourceQuestion && !selectedSourceQuestion.hasVariable && (
            <Alert.Root variant="warning">
              <Alert.Description>
                {t("blocks.logic.loop.sourceQuestion.missingVariable")}
              </Alert.Description>
            </Alert.Root>
          )}
        </Field.Root>
      )}

      {sourceType === "list" && (
        <Field.Root>
          <Field.Label>
            {t("blocks.logic.loop.sourceVariable.list")}
            <MoreInfoTooltip>
              {t("blocks.logic.loop.sourceVariable.list.helperText")}
            </MoreInfoTooltip>
          </Field.Label>
          <VariablesCombobox
            initialVariableId={options?.sourceVariableId}
            onSelectVariable={(variable?: Variable) =>
              updateOptions({ sourceVariableId: variable?.id })
            }
          />
        </Field.Root>
      )}

      {sourceType === "count" && (
        <>
          <Field.Root>
            <Field.Label>{t("blocks.logic.loop.count")}</Field.Label>
            <BasicNumberInput
              withVariableButton={false}
              min={0}
              max={maxLoopIterations}
              defaultValue={options?.count ?? defaultLoopOptions.count}
              onValueChange={(count) => updateOptions({ count })}
            />
          </Field.Root>
          <Field.Root>
            <Field.Label>
              {t("blocks.logic.loop.sourceVariable.count")}
              <MoreInfoTooltip>
                {t("blocks.logic.loop.sourceVariable.count.helperText")}
              </MoreInfoTooltip>
            </Field.Label>
            <VariablesCombobox
              initialVariableId={options?.sourceVariableId}
              onSelectVariable={(variable?: Variable) =>
                updateOptions({ sourceVariableId: variable?.id })
              }
            />
          </Field.Root>
        </>
      )}

      <Field.Root>
        <Field.Label>
          {t("blocks.logic.loop.body")}
          <MoreInfoTooltip>
            {t("blocks.logic.loop.body.helperText")}
          </MoreInfoTooltip>
        </Field.Label>
        <BasicSelect
          className="w-full"
          value={options?.bodyGroupId}
          items={bodyGroups.map((group) => ({
            label: group.title,
            value: group.id,
          }))}
          placeholder={t("blocks.logic.loop.body.placeholder")}
          onChange={(bodyGroupId: string | undefined) =>
            updateOptions({ bodyGroupId })
          }
        />
      </Field.Root>

      <Field.Root>
        <Field.Label>{t("blocks.logic.loop.currentItemVariable")}</Field.Label>
        <VariablesCombobox
          initialVariableId={options?.currentItemVariableId}
          onSelectVariable={(variable?: Variable) =>
            updateOptions({ currentItemVariableId: variable?.id })
          }
        />
      </Field.Root>
      <Field.Root>
        <Field.Label>
          {t("blocks.logic.loop.iterationNumberVariable")}
        </Field.Label>
        <VariablesCombobox
          initialVariableId={options?.iterationNumberVariableId}
          onSelectVariable={(variable?: Variable) =>
            updateOptions({ iterationNumberVariableId: variable?.id })
          }
        />
      </Field.Root>
      <Field.Root>
        <Field.Label>{t("blocks.logic.loop.currentIndexVariable")}</Field.Label>
        <VariablesCombobox
          initialVariableId={options?.currentIndexVariableId}
          onSelectVariable={(variable?: Variable) =>
            updateOptions({ currentIndexVariableId: variable?.id })
          }
        />
      </Field.Root>

      <Field.Container>
        <Field.Root className="flex-row items-center">
          <Switch
            checked={options?.breakCondition?.isEnabled ?? false}
            onCheckedChange={(isEnabled) =>
              updateOptions({
                breakCondition: { ...options?.breakCondition, isEnabled },
              })
            }
          />
          <Field.Label>
            {t("blocks.logic.loop.break")}
            <MoreInfoTooltip>
              {t("blocks.logic.loop.break.helperText")}
            </MoreInfoTooltip>
          </Field.Label>
        </Field.Root>
        {options?.breakCondition?.isEnabled && (
          <ConditionForm
            condition={options.breakCondition.condition ?? emptyCondition}
            onConditionChange={(condition) =>
              updateOptions({
                breakCondition: { ...options.breakCondition, condition },
              })
            }
          />
        )}
      </Field.Container>

      <Field.Container>
        <Field.Root className="flex-row items-center">
          <Switch
            checked={options?.continueCondition?.isEnabled ?? false}
            onCheckedChange={(isEnabled) =>
              updateOptions({
                continueCondition: { ...options?.continueCondition, isEnabled },
              })
            }
          />
          <Field.Label>
            {t("blocks.logic.loop.continue")}
            <MoreInfoTooltip>
              {t("blocks.logic.loop.continue.helperText")}
            </MoreInfoTooltip>
          </Field.Label>
        </Field.Root>
        {options?.continueCondition?.isEnabled && (
          <ConditionForm
            condition={options.continueCondition.condition ?? emptyCondition}
            onConditionChange={(condition) =>
              updateOptions({
                continueCondition: { ...options.continueCondition, condition },
              })
            }
          />
        )}
      </Field.Container>
    </div>
  );
};
