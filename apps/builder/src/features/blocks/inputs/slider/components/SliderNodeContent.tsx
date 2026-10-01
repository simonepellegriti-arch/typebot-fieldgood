import { useTranslate } from "@tolgee/react";
import { getSliderRows } from "@typebot.io/blocks-inputs/slider/helpers/getSliderRows";
import { resolveSliderScale } from "@typebot.io/blocks-inputs/slider/helpers/resolveSliderScale";
import type { SliderInputBlock } from "@typebot.io/blocks-inputs/slider/schema";
import { WithVariableContent } from "@/features/graph/components/nodes/block/WithVariableContent";

type Props = {
  options: SliderInputBlock["options"];
};

export const SliderNodeContent = ({ options }: Props) => {
  const { t } = useTranslate();
  const { min, max } = resolveSliderScale(options);
  const rowCount = getSliderRows(options).length;
  return (
    <div className="flex flex-col gap-1">
      <p className={options?.question ? undefined : "text-gray-9"}>
        {options?.question || t("blocks.inputs.slider.node.placeholder")}
      </p>
      <p className="text-xs text-gray-9">
        {t("blocks.inputs.slider.node.scale", { min, max, count: rowCount })}
      </p>
      {options?.variableId && (
        <WithVariableContent variableId={options.variableId} />
      )}
    </div>
  );
};
