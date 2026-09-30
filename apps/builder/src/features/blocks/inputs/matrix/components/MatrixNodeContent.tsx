import { useTranslate } from "@tolgee/react";
import type { MatrixInputBlock } from "@typebot.io/blocks-inputs/matrix/schema";
import { WithVariableContent } from "@/features/graph/components/nodes/block/WithVariableContent";

type Props = {
  options: MatrixInputBlock["options"];
};

export const MatrixNodeContent = ({ options }: Props) => {
  const { t } = useTranslate();
  const rowCount = options?.rows?.length ?? 0;
  const columnCount = options?.columns?.length ?? 0;
  return (
    <div className="flex flex-col gap-1">
      <p className={options?.question ? undefined : "text-gray-9"}>
        {options?.question ||
          t("blocks.inputs.matrix.node.placeholder", {
            rows: rowCount,
            columns: columnCount,
          })}
      </p>
      {options?.question && (
        <p className="text-xs text-gray-9">
          {t("blocks.inputs.matrix.node.size", {
            rows: rowCount,
            columns: columnCount,
          })}
        </p>
      )}
      {options?.variableId && (
        <WithVariableContent variableId={options.variableId} />
      )}
    </div>
  );
};
