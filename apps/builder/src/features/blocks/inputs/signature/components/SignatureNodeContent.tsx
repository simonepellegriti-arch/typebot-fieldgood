import { useTranslate } from "@tolgee/react";
import type { SignatureInputBlock } from "@typebot.io/blocks-inputs/signature/schema";
import { WithVariableContent } from "@/features/graph/components/nodes/block/WithVariableContent";

type Props = {
  options: SignatureInputBlock["options"];
};

export const SignatureNodeContent = ({ options }: Props) => {
  const { t } = useTranslate();
  return (
    <div className="flex flex-col gap-1">
      <p className={options?.question ? undefined : "text-gray-9"}>
        {options?.question || t("blocks.inputs.signature.node.placeholder")}
      </p>
      {options?.variableId && (
        <WithVariableContent variableId={options.variableId} />
      )}
    </div>
  );
};
