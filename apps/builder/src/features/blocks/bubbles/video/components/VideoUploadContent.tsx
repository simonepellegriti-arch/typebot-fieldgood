import { useTranslate } from "@tolgee/react";
import { VideoBubbleContentType } from "@typebot.io/blocks-bubbles/video/constants";
import { parseVideoUrl } from "@typebot.io/blocks-bubbles/video/helpers";
import type { VideoBubbleBlock } from "@typebot.io/blocks-bubbles/video/schema";
import { Button } from "@typebot.io/ui/components/Button";
import { useState } from "react";
import { UploadButton } from "@/components/ImageUploadContent/UploadButton";
import { PexelsPicker } from "@/components/VideoUploadContent/PexelsPicker";
import { VideoLinkEmbedContent } from "@/components/VideoUploadContent/VideoLinkEmbedContent";
import type { FilePathUploadProps } from "@/features/upload/api/generateUploadUrl";
import { VideoResearchSettings } from "./VideoResearchSettings";

type Tabs = "link" | "upload" | "pexels";

type Props = {
  content?: VideoBubbleBlock["content"];
  /** Enables the upload tab (MP4/WebM stored with the bot's other media). */
  uploadFileProps?: FilePathUploadProps;
  onSubmit: (content: VideoBubbleBlock["content"]) => void;
  initialTab?: Tabs;
} & (
  | {
      includedTabs?: Tabs[];
    }
  | {
      excludedTabs?: Tabs[];
    }
);

const defaultDisplayedTabs: Tabs[] = ["link", "upload", "pexels"];

export const VideoUploadContent = ({
  content,
  uploadFileProps,
  onSubmit,
  initialTab,
  ...props
}: Props) => {
  const { t } = useTranslate();
  const includedTabs =
    "includedTabs" in props
      ? (props.includedTabs ?? defaultDisplayedTabs)
      : defaultDisplayedTabs;
  const excludedTabs =
    "excludedTabs" in props ? (props.excludedTabs ?? []) : [];
  const displayedTabs = defaultDisplayedTabs.filter(
    (tab) =>
      !excludedTabs.includes(tab) &&
      includedTabs.includes(tab) &&
      (tab !== "upload" || uploadFileProps !== undefined),
  );

  const [currentTab, setCurrentTab] = useState<Tabs>(
    initialTab ?? displayedTabs[0],
  );

  const updateUrl = (url: string) => {
    const {
      type,
      url: matchedUrl,
      id,
      videoSizeSuggestion,
    } = parseVideoUrl(url);
    if (currentTab !== "link") {
      // Allow user to update video settings after selection
      setCurrentTab("link");
    }
    return onSubmit({
      ...content,
      type,
      url: matchedUrl,
      id,
      ...(!content?.aspectRatio && !content?.maxWidth
        ? videoSizeSuggestion
        : {}),
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        {displayedTabs.includes("link") && (
          <Button
            variant={currentTab === "link" ? "outline" : "ghost"}
            onClick={() => setCurrentTab("link")}
            size="sm"
          >
            Link
          </Button>
        )}
        {displayedTabs.includes("upload") && (
          <Button
            variant={currentTab === "upload" ? "outline" : "ghost"}
            onClick={() => setCurrentTab("upload")}
            size="sm"
          >
            {t("video.upload.tab")}
          </Button>
        )}
        {displayedTabs.includes("pexels") && (
          <Button
            variant={currentTab === "pexels" ? "outline" : "ghost"}
            onClick={() => setCurrentTab("pexels")}
            size="sm"
          >
            Pexels
          </Button>
        )}
      </div>
      {/* Body content to be displayed below conditionally based on currentTab */}
      {currentTab === "link" && (
        <VideoLinkEmbedContent
          content={content}
          updateUrl={updateUrl}
          onSubmit={onSubmit}
        />
      )}
      {currentTab === "upload" && uploadFileProps && (
        <div className="flex flex-col items-center gap-2 py-2">
          <UploadButton
            fileType="video"
            filePathProps={uploadFileProps}
            onFileUploaded={updateUrl}
          >
            {t("video.upload.chooseFile")}
          </UploadButton>
          <p className="text-xs text-gray-9">{t("video.upload.helperText")}</p>
        </div>
      )}
      {currentTab === "pexels" && <PexelsPicker onVideoSelect={updateUrl} />}
      {content?.url && content.type === VideoBubbleContentType.URL && (
        <VideoResearchSettings content={content} onSubmit={onSubmit} />
      )}
    </div>
  );
};
