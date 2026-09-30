import { createId } from "@paralleldrive/cuid2";
import { useTranslate } from "@tolgee/react";
import {
  type ScoreOperation,
  type ScoreTarget,
  scoreOperations,
} from "@typebot.io/blocks-inputs/scoring/schema";
import { Button } from "@typebot.io/ui/components/Button";
import { Field } from "@typebot.io/ui/components/Field";
import { MoreInfoTooltip } from "@typebot.io/ui/components/MoreInfoTooltip";
import { PlusSignIcon } from "@typebot.io/ui/icons/PlusSignIcon";
import { TrashIcon } from "@typebot.io/ui/icons/TrashIcon";
import type { Variable } from "@typebot.io/variables/schemas";
import { BasicSelect } from "@/components/inputs/BasicSelect";
import { VariablesCombobox } from "@/components/inputs/VariablesCombobox";

type Props = {
  scoreTargets: ScoreTarget[] | undefined;
  onScoreTargetsChange: (scoreTargets: ScoreTarget[]) => void;
};

/**
 * Score variables fed by a question (TOTAL_SCORE, BRAND_SCORE...). Each target
 * applies the answer score with its own operation, so one question can feed
 * several independent scores, usable afterwards in conditions.
 */
export const ScoreTargetsEditor = ({
  scoreTargets = [],
  onScoreTargetsChange,
}: Props) => {
  const { t } = useTranslate();

  const updateScoreTarget = (
    scoreTargetId: string,
    updates: Partial<ScoreTarget>,
  ) =>
    onScoreTargetsChange(
      scoreTargets.map((scoreTarget) =>
        scoreTarget.id === scoreTargetId
          ? { ...scoreTarget, ...updates }
          : scoreTarget,
      ),
    );

  const operationItems = scoreOperations.map((operation) => ({
    label: t(`blocks.inputs.score.operation.${operation}`),
    value: operation,
  }));

  return (
    <Field.Root>
      <Field.Label>
        {t("blocks.inputs.score.targets.label")}
        <MoreInfoTooltip>
          {t("blocks.inputs.score.targets.helperText")}
        </MoreInfoTooltip>
      </Field.Label>
      <div className="flex flex-col gap-2">
        {scoreTargets.map((scoreTarget) => (
          <div key={scoreTarget.id} className="flex items-center gap-2">
            <BasicSelect
              className="w-32"
              items={operationItems}
              value={scoreTarget.operation ?? "add"}
              onChange={(operation: ScoreOperation) =>
                updateScoreTarget(scoreTarget.id, { operation })
              }
            />
            <div className="flex-1">
              <VariablesCombobox
                initialVariableId={scoreTarget.variableId}
                onSelectVariable={(variable?: Variable) =>
                  updateScoreTarget(scoreTarget.id, {
                    variableId: variable?.id,
                  })
                }
              />
            </div>
            <Button
              size="icon"
              variant="ghost"
              aria-label={t("blocks.inputs.matrix.entry.remove")}
              onClick={() =>
                onScoreTargetsChange(
                  scoreTargets.filter(({ id }) => id !== scoreTarget.id),
                )
              }
            >
              <TrashIcon />
            </Button>
          </div>
        ))}
        <Button
          variant="secondary"
          onClick={() =>
            onScoreTargetsChange([
              ...scoreTargets,
              { id: createId(), operation: "add" },
            ])
          }
        >
          <PlusSignIcon />
          {t("blocks.inputs.score.targets.add")}
        </Button>
      </div>
    </Field.Root>
  );
};
