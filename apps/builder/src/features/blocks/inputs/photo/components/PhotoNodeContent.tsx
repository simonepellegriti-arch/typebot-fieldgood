import { useTranslate } from "@tolgee/react";
import { defaultPhotoInputOptions } from "@typebot.io/blocks-inputs/photo/constants";
import type { PhotoInputBlock } from "@typebot.io/blocks-inputs/photo/schema";
import { WithVariableContent } from "@/features/graph/components/nodes/block/WithVariableContent";

type Props = {
  options: PhotoInputBlock["options"];
};

export const PhotoNodeContent = ({ options }: Props) => {
  const { t } = useTranslate();
  const maxPhotos = options?.maxPhotos ?? defaultPhotoInputOptions.maxPhotos;
  return (
    <div className="flex flex-col gap-1">
      <p className={options?.question ? undefined : "text-gray-9"}>
        {options?.question || t("blocks.inputs.photo.node.placeholder")}
      </p>
      {maxPhotos > 1 && (
        <p className="text-gray-9 text-sm">
          {t("blocks.inputs.photo.node.maxPhotos", { count: maxPhotos })}
        </p>
      )}
      {options?.variableId && (
        <WithVariableContent variableId={options.variableId} />
      )}
    </div>
  );
};
