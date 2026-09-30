import { useTranslate } from "@tolgee/react";
import type { VideoCodecReport } from "@typebot.io/blocks-bubbles/video/media/detectVideoCodecs";
import { Alert } from "@typebot.io/ui/components/Alert";
import { Button } from "@typebot.io/ui/components/Button";
import { useState } from "react";
import { checkVideoCompatibility } from "../helpers/checkVideoCompatibility";

type Props = {
  url: string | undefined;
};

/**
 * "Check compatibility" for a native video link: shows container and codecs and
 * warns when the file won't play everywhere (e.g. HEVC, VP9 in MP4, WebM on old
 * iPhones), recommending MP4 H.264 + AAC with a WebM fallback.
 */
export const VideoCompatibilityCheck = ({ url }: Props) => {
  const { t } = useTranslate();
  const [status, setStatus] = useState<
    | { type: "idle" | "checking" | "unreachable" }
    | { type: "done"; report: VideoCodecReport }
  >({ type: "idle" });

  if (!url || url.includes("{{")) return null;

  const check = async () => {
    setStatus({ type: "checking" });
    const report = await checkVideoCompatibility(url);
    setStatus(report ? { type: "done", report } : { type: "unreachable" });
  };

  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="secondary"
        size="sm"
        disabled={status.type === "checking"}
        onClick={check}
      >
        {t("video.compatibility.check")}
      </Button>
      {status.type === "unreachable" && (
        <p className="text-xs text-gray-10">
          {t("video.compatibility.unreachable")}
        </p>
      )}
      {status.type === "done" && (
        <VideoCompatibilityReport report={status.report} />
      )}
    </div>
  );
};

export const VideoCompatibilityReport = ({
  report,
}: {
  report: VideoCodecReport;
}) => {
  const { t } = useTranslate();
  const summary = [
    report.container.toUpperCase(),
    ...report.videoCodecs,
    ...report.audioCodecs,
  ].join(" · ");
  return (
    <Alert.Root variant={report.isWidelyCompatible ? "success" : "warning"}>
      <Alert.Description>
        <p className="font-medium">
          {report.isWidelyCompatible
            ? t("video.compatibility.ok")
            : t("video.compatibility.warning")}{" "}
          ({summary})
        </p>
        {report.warnings.map((warning) => (
          <p key={warning}>{warning}</p>
        ))}
      </Alert.Description>
    </Alert.Root>
  );
};
