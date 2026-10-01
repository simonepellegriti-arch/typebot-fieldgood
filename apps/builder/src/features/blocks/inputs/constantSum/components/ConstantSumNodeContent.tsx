import { useTranslate } from "@tolgee/react";
import { defaultConstantSumInputOptions } from "@typebot.io/blocks-inputs/constantSum/constants";
import type { ConstantSumInputBlock } from "@typebot.io/blocks-inputs/constantSum/schema";
import { WithVariableContent } from "@/features/graph/components/nodes/block/WithVariableContent";

type Props = {
  options: ConstantSumInputBlock["options"];
};

export const ConstantSumNodeContent = ({ options }: Props) => {
  const { t } = useTranslate();
  const total = options?.total ?? defaultConstantSumInputOptions.total;
  const itemCount = options?.items?.length ?? 0;
  return (
    <div className="flex flex-col gap-1">
      <p className={options?.question ? undefined : "text-gray-9"}>
        {options?.question || t("blocks.inputs.constantSum.node.placeholder")}
      </p>
      <p className="text-xs text-gray-9">
        {t("blocks.inputs.constantSum.node.summary", {
          total,
          count: itemCount,
        })}
      </p>
      {options?.variableId && (
        <WithVariableContent variableId={options.variableId} />
      )}
    </div>
  );
};
