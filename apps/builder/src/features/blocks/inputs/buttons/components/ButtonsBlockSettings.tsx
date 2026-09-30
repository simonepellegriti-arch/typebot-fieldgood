import { useTranslate } from "@tolgee/react";
import {
  defaultChoiceInputOptions,
  defaultChoiceMediaOptions,
} from "@typebot.io/blocks-inputs/choice/constants";
import type { ChoiceInputBlock } from "@typebot.io/blocks-inputs/choice/schema";
import { Field } from "@typebot.io/ui/components/Field";
import { MoreInfoTooltip } from "@typebot.io/ui/components/MoreInfoTooltip";
import { Switch } from "@typebot.io/ui/components/Switch";
import type { Variable } from "@typebot.io/variables/schemas";
import { BasicNumberInput } from "@/components/inputs/BasicNumberInput";
import { DebouncedTextInputWithVariablesButton } from "@/components/inputs/DebouncedTextInput";
import { VariablesCombobox } from "@/components/inputs/VariablesCombobox";
import { ScoreTargetsEditor } from "../../scoring/ScoreTargetsEditor";

type Props = {
  options?: ChoiceInputBlock["options"];
  /** Items of the block: video settings are shown only when an option has a video. */
  items?: ChoiceInputBlock["items"];
  onOptionsChange: (options: ChoiceInputBlock["options"]) => void;
};

export const ButtonsBlockSettings = ({
  options,
  items,
  onOptionsChange,
}: Props) => {
  const { t } = useTranslate();
  const hasVideoOptions =
    items?.some((item) => item.media?.type === "video") ?? false;
  const isWatchRequired =
    options?.requireWatchBeforeSelect ??
    defaultChoiceMediaOptions.requireWatchBeforeSelect;
  const updateIsMultiple = (isMultipleChoice: boolean) =>
    onOptionsChange({ ...options, isMultipleChoice });
  const updateIsSearchable = (isSearchable: boolean) =>
    onOptionsChange({ ...options, isSearchable });
  const updateButtonLabel = (buttonLabel: string) =>
    onOptionsChange({ ...options, buttonLabel });
  const updateSearchInputPlaceholder = (searchInputPlaceholder: string) =>
    onOptionsChange({ ...options, searchInputPlaceholder });
  const updateSaveVariable = (variable?: Variable) =>
    onOptionsChange({ ...options, variableId: variable?.id });
  const updateDynamicDataVariable = (variable?: Variable) =>
    onOptionsChange({ ...options, dynamicVariableId: variable?.id });
  const updateAreInitialSearchButtonsVisible = (
    areInitialSearchButtonsVisible: boolean,
  ) => onOptionsChange({ ...options, areInitialSearchButtonsVisible });

  return (
    <div className="flex flex-col gap-4">
      <Field.Container>
        <Field.Root className="flex-row items-center">
          <Switch
            checked={
              options?.isMultipleChoice ??
              defaultChoiceInputOptions.isMultipleChoice
            }
            onCheckedChange={updateIsMultiple}
          />
          <Field.Label className="font-medium">
            {t("blocks.inputs.settings.multipleChoice.label")}
          </Field.Label>
        </Field.Root>
        {(options?.isMultipleChoice ??
          defaultChoiceInputOptions.isMultipleChoice) && (
          <Field.Root>
            <Field.Label>
              {t("blocks.inputs.settings.submitButton.label")}
            </Field.Label>
            <DebouncedTextInputWithVariablesButton
              defaultValue={
                options?.buttonLabel ??
                t("blocks.inputs.settings.buttonText.label")
              }
              onValueChange={updateButtonLabel}
            />
          </Field.Root>
        )}
        {(options?.isMultipleChoice ??
          defaultChoiceInputOptions.isMultipleChoice) && (
          <div className="flex gap-2">
            <Field.Root className="flex-1">
              <Field.Label>
                {t("blocks.inputs.settings.minSelections.label")}
                <MoreInfoTooltip>
                  {t("blocks.inputs.settings.minSelections.helperText")}
                </MoreInfoTooltip>
              </Field.Label>
              <BasicNumberInput
                withVariableButton={false}
                min={1}
                defaultValue={options?.minSelections}
                onValueChange={(minSelections) =>
                  onOptionsChange({ ...options, minSelections })
                }
              />
            </Field.Root>
            <Field.Root className="flex-1">
              <Field.Label>
                {t("blocks.inputs.settings.maxSelections.label")}
              </Field.Label>
              <BasicNumberInput
                withVariableButton={false}
                min={1}
                defaultValue={options?.maxSelections}
                onValueChange={(maxSelections) =>
                  onOptionsChange({ ...options, maxSelections })
                }
              />
            </Field.Root>
          </div>
        )}
      </Field.Container>
      <Field.Container>
        <Field.Root className="flex-row items-center">
          <Switch
            checked={
              options?.isSearchable ?? defaultChoiceInputOptions.isSearchable
            }
            onCheckedChange={updateIsSearchable}
          />
          <Field.Label className="font-medium">
            {t("blocks.inputs.settings.isSearchable.label")}
          </Field.Label>
        </Field.Root>
        {(options?.isSearchable ?? defaultChoiceInputOptions.isSearchable) && (
          <>
            <Field.Root className="flex-row items-center">
              <Switch
                checked={
                  options?.areInitialSearchButtonsVisible ??
                  defaultChoiceInputOptions.areInitialSearchButtonsVisible
                }
                onCheckedChange={updateAreInitialSearchButtonsVisible}
              />
              <Field.Label>Default display buttons</Field.Label>
            </Field.Root>
            <Field.Root>
              <Field.Label>
                {t("blocks.inputs.settings.input.placeholder.label")}
              </Field.Label>
              <DebouncedTextInputWithVariablesButton
                defaultValue={
                  options?.searchInputPlaceholder ??
                  t("blocks.inputs.settings.input.filterOptions.label")
                }
                onValueChange={updateSearchInputPlaceholder}
              />
            </Field.Root>
          </>
        )}
      </Field.Container>
      <Field.Root className="flex-row items-center">
        <Switch
          checked={
            options?.areItemsRandomized ??
            defaultChoiceMediaOptions.areItemsRandomized
          }
          onCheckedChange={(areItemsRandomized) =>
            onOptionsChange({ ...options, areItemsRandomized })
          }
        />
        <Field.Label>
          {t("blocks.inputs.button.settings.randomize.label")}
          <MoreInfoTooltip>
            {t("blocks.inputs.button.settings.randomize.helperText")}
          </MoreInfoTooltip>
        </Field.Label>
      </Field.Root>
      {hasVideoOptions && (
        <Field.Container>
          <Field.Root className="flex-row items-center">
            <Switch
              checked={isWatchRequired}
              onCheckedChange={(requireWatchBeforeSelect) =>
                onOptionsChange({ ...options, requireWatchBeforeSelect })
              }
            />
            <Field.Label>
              {t("blocks.inputs.button.settings.requireWatch.label")}
              <MoreInfoTooltip>
                {t("blocks.inputs.button.settings.requireWatch.helperText")}
              </MoreInfoTooltip>
            </Field.Label>
          </Field.Root>
          {isWatchRequired && (
            <Field.Root>
              <Field.Label>
                {t("blocks.inputs.button.settings.minimumWatch.label")}
              </Field.Label>
              <BasicNumberInput
                withVariableButton={false}
                min={1}
                max={100}
                defaultValue={
                  options?.minimumWatchPercentage ??
                  defaultChoiceMediaOptions.minimumWatchPercentage
                }
                onValueChange={(minimumWatchPercentage) =>
                  onOptionsChange({ ...options, minimumWatchPercentage })
                }
              />
            </Field.Root>
          )}
        </Field.Container>
      )}
      <ScoreTargetsEditor
        scoreTargets={options?.scoreTargets}
        onScoreTargetsChange={(scoreTargets) =>
          onOptionsChange({ ...options, scoreTargets })
        }
      />
      <Field.Root>
        <Field.Label>
          {t("blocks.inputs.button.settings.dynamicData.label")}
          <MoreInfoTooltip>
            {t("blocks.inputs.button.settings.dynamicData.infoText.label")}
          </MoreInfoTooltip>
        </Field.Label>
        <VariablesCombobox
          initialVariableId={options?.dynamicVariableId}
          onSelectVariable={updateDynamicDataVariable}
        />
      </Field.Root>
      <Field.Root>
        <Field.Label>
          {t("blocks.inputs.settings.saveAnswer.label")}
        </Field.Label>
        <VariablesCombobox
          initialVariableId={options?.variableId}
          onSelectVariable={updateSaveVariable}
        />
      </Field.Root>
    </div>
  );
};
