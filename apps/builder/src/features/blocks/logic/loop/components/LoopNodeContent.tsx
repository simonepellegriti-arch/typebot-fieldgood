import { useTranslate } from "@tolgee/react";
import { defaultLoopOptions } from "@typebot.io/blocks-logic/loop/constants";
import type { LoopBlock } from "@typebot.io/blocks-logic/loop/schema";
import { byId } from "@typebot.io/lib/utils";
import { Badge } from "@typebot.io/ui/components/Badge";
import { useTypebot } from "@/features/editor/providers/TypebotProvider";

type Props = {
  options: LoopBlock["options"];
};

export const LoopNodeContent = ({ options }: Props) => {
  const { t } = useTranslate();
  const { typebot } = useTypebot();
  const bodyGroup = options?.bodyGroupId
    ? typebot?.groups.find(byId(options.bodyGroupId))
    : undefined;
  if (!bodyGroup)
    return <p className="text-gray-9">{t("blocks.logic.loop.configure")}</p>;
  const sourceType = options?.sourceType ?? defaultLoopOptions.sourceType;
  const sourceVariableName = typebot?.variables.find(
    byId(options?.sourceVariableId),
  )?.name;
  return (
    <div className="flex flex-col gap-1">
      <p>
        {t("blocks.logic.loop.node.repeat")}{" "}
        <Badge colorScheme="purple">{bodyGroup.title}</Badge>
      </p>
      <p className="text-xs text-gray-10">
        {sourceType === "count"
          ? sourceVariableName
            ? `× {{${sourceVariableName}}}`
            : `× ${options?.count ?? defaultLoopOptions.count}`
          : sourceType === "answers"
            ? t("blocks.logic.loop.source.answers")
            : sourceVariableName
              ? `{{${sourceVariableName}}}`
              : t("blocks.logic.loop.source.list")}
      </p>
    </div>
  );
};
