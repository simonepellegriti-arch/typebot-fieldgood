import { fixWebmDuration } from "@fix-webm-duration/fix";
import {
  createSignal,
  Match,
  onCleanup,
  onMount,
  Show,
  Switch,
} from "solid-js";
import { Button } from "../../../../../components/Button";
import { checkMediaAnswerFile } from "../../../../../components/media/checkMediaAnswerFile";
import { computeVideoRecordingBitrate } from "../../../../../components/media/computeVideoRecordingBitrate";
import { formatVideoTime } from "../../../../../components/media/formatVideoTime";
import { getMediaAnswerLabels } from "../../../../../components/media/getMediaAnswerLabels";
import {
  pickVideoRecordingFormat,
  type VideoRecordingFormat,
} from "../../../../../components/media/pickVideoRecordingFormat";
import { withInferredMediaFileType } from "../../../../../components/media/withInferredMediaFileType";

type Props = {
  maxDurationSeconds: number;
  maxFileSizeMB: number;
  /** Respondents can also pick an existing video from their device. */
  isFileUploadAllowed: boolean;
  isUploading: boolean;
  onSubmit: (file: File) => void;
  onCancel: () => void;
};

type CameraStatus =
  | "requesting"
  | "ready"
  | "recording"
  | "permissionDenied"
  | "unsupported";

type Clip = { file: File; blobUrl: string; source: "recorded" | "uploaded" };

/**
 * Video answer of an open question: live camera preview (inline on iPhone),
 * recording limited to the configured duration, or a video picked from the
 * device; then review, record / choose again and send. The camera is released
 * as soon as it isn't needed.
 */
export const VideoRecorder = (props: Props) => {
  const labels = getMediaAnswerLabels();
  const [cameraStatus, setCameraStatus] =
    createSignal<CameraStatus>("requesting");
  const [elapsedSeconds, setElapsedSeconds] = createSignal(0);
  const [clip, setClip] = createSignal<Clip>();
  const [error, setError] = createSignal<string>();
  let previewVideo: HTMLVideoElement | undefined;
  let fileInput: HTMLInputElement | undefined;
  let stream: MediaStream | undefined;
  let mediaRecorder: MediaRecorder | undefined;
  let recordedChunks: Blob[] = [];
  let recordingStartedAt = 0;
  let elapsedInterval: ReturnType<typeof setInterval> | undefined;
  let format: VideoRecordingFormat | undefined;

  const maxFileSizeBytes = () => props.maxFileSizeMB * 1024 * 1024;
  const isCameraAvailable = () =>
    cameraStatus() !== "permissionDenied" && cameraStatus() !== "unsupported";

  const openCamera = async () => {
    format =
      typeof MediaRecorder !== "undefined"
        ? pickVideoRecordingFormat((mimeType) =>
            MediaRecorder.isTypeSupported(mimeType),
          )
        : undefined;
    if (!format || !navigator.mediaDevices?.getUserMedia)
      return setCameraStatus("unsupported");
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 24, max: 30 },
        },
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      showLivePreview();
      setCameraStatus("ready");
    } catch {
      setCameraStatus("permissionDenied");
    }
  };

  const showLivePreview = () => {
    if (!previewVideo || !stream) return;
    previewVideo.removeAttribute("src");
    previewVideo.srcObject = stream;
    previewVideo.muted = true;
    previewVideo.controls = false;
    void previewVideo.play().catch(() => {});
  };

  const showClip = (newClip: Clip) => {
    const previousClip = clip();
    if (previousClip) URL.revokeObjectURL(previousClip.blobUrl);
    setClip(newClip);
    if (!previewVideo) return;
    previewVideo.srcObject = null;
    previewVideo.src = newClip.blobUrl;
    previewVideo.muted = false;
    previewVideo.controls = true;
  };

  const startRecording = () => {
    if (!stream || !format) return;
    setError(undefined);
    recordedChunks = [];
    mediaRecorder = new MediaRecorder(stream, {
      mimeType: format.mimeType,
      ...computeVideoRecordingBitrate({
        maxDurationSeconds: props.maxDurationSeconds,
        maxFileSizeBytes: maxFileSizeBytes(),
      }),
    });
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) recordedChunks.push(event.data);
    };
    mediaRecorder.onstop = () => void finishRecording();
    recordingStartedAt = Date.now();
    setElapsedSeconds(0);
    elapsedInterval = setInterval(() => {
      const seconds = Math.floor((Date.now() - recordingStartedAt) / 1000);
      setElapsedSeconds(seconds);
      if (seconds >= props.maxDurationSeconds) stopRecording();
    }, 250);
    mediaRecorder.start(1000);
    setCameraStatus("recording");
  };

  const stopRecording = () => {
    if (elapsedInterval) clearInterval(elapsedInterval);
    elapsedInterval = undefined;
    if (mediaRecorder && mediaRecorder.state !== "inactive")
      mediaRecorder.stop();
  };

  const finishRecording = async () => {
    setCameraStatus("ready");
    if (!format || recordedChunks.length === 0) return;
    const contentType = format.mimeType.split(";")[0] ?? format.mimeType;
    const rawBlob = new Blob(recordedChunks, { type: contentType });
    // Chrome writes WebM files without duration: players can't seek them.
    const blob =
      format.extension === "webm"
        ? await fixWebmDuration(rawBlob, Date.now() - recordingStartedAt)
        : rawBlob;
    const file = new File(
      [blob],
      `video-answer-${Date.now()}.${format.extension}`,
      { type: contentType },
    );
    if (file.size > maxFileSizeBytes())
      return setError(
        labels.tooLarge.replace("{size}", String(props.maxFileSizeMB)),
      );
    showClip({ file, blobUrl: URL.createObjectURL(file), source: "recorded" });
  };

  const handlePickedFile = (pickedFile: File | undefined) => {
    if (!pickedFile) return;
    const file = withInferredMediaFileType(pickedFile);
    setError(undefined);
    const problem = checkMediaAnswerFile({
      file,
      kind: "video",
      maxFileSizeMB: props.maxFileSizeMB,
    });
    if (problem === "wrongType") return setError(labels.wrongVideoType);
    if (problem === "tooLarge")
      return setError(
        labels.tooLarge.replace("{size}", String(props.maxFileSizeMB)),
      );
    showClip({ file, blobUrl: URL.createObjectURL(file), source: "uploaded" });
  };

  /** Uploaded videos longer than the maximum duration are refused. */
  const checkClipDuration = () => {
    const currentClip = clip();
    if (!previewVideo || currentClip?.source !== "uploaded") return;
    if (previewVideo.duration > props.maxDurationSeconds + 1) {
      setError(
        labels.tooLong.replace(
          "{duration}",
          formatVideoTime(props.maxDurationSeconds),
        ),
      );
      discardClip();
    }
  };

  const discardClip = () => {
    const currentClip = clip();
    if (currentClip) URL.revokeObjectURL(currentClip.blobUrl);
    setClip(undefined);
    if (previewVideo) {
      previewVideo.removeAttribute("src");
      previewVideo.load();
    }
  };

  const retake = async () => {
    discardClip();
    if (!isCameraAvailable()) return;
    // The camera is released when a clip is sent: reopen it if needed.
    if (!stream) return openCamera();
    showLivePreview();
  };

  const releaseCamera = () => {
    if (elapsedInterval) clearInterval(elapsedInterval);
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.onstop = null;
      mediaRecorder.stop();
    }
    for (const track of stream?.getTracks() ?? []) track.stop();
    stream = undefined;
  };

  const submit = () => {
    const currentClip = clip();
    if (!currentClip) return;
    releaseCamera();
    props.onSubmit(currentClip.file);
  };

  const cancel = () => {
    releaseCamera();
    props.onCancel();
  };

  onMount(() => void openCamera());
  onCleanup(releaseCamera);

  const remainingSeconds = () =>
    Math.max(0, props.maxDurationSeconds - elapsedSeconds());
  const isPreviewVisible = () => clip() !== undefined || isCameraAvailable();

  return (
    <div class="flex flex-col gap-2 w-full typebot-video-recorder">
      <Show when={!clip()}>
        <Switch>
          <Match when={cameraStatus() === "unsupported"}>
            <p class="text-sm" role="alert">
              {labels.unsupported}
            </p>
          </Match>
          <Match when={cameraStatus() === "permissionDenied"}>
            <p class="text-sm" role="alert">
              {labels.permissionDenied}
            </p>
          </Match>
        </Switch>
      </Show>
      <div
        class={
          isPreviewVisible()
            ? "relative w-full overflow-hidden rounded-md bg-black/80"
            : "hidden"
        }
      >
        <video
          ref={(video) => {
            previewVideo = video;
            video.setAttribute("playsinline", "");
            video.setAttribute("webkit-playsinline", "");
          }}
          class="w-full aspect-video object-cover"
          autoplay
          muted
          onLoadedMetadata={checkClipDuration}
        />
        <Show when={!clip() && cameraStatus() === "requesting"}>
          <p class="absolute inset-0 flex items-center justify-center text-white text-sm p-4 text-center">
            {labels.requesting}
          </p>
        </Show>
        <Show when={cameraStatus() === "recording"}>
          <div
            class="absolute left-2 top-2 flex items-center gap-2 rounded-md bg-black/60 text-white text-xs px-2 py-1"
            aria-live="polite"
          >
            <span class="size-2 rounded-full bg-red-500 animate-pulse" />
            <span class="tabular-nums">
              {formatVideoTime(elapsedSeconds())} ·{" "}
              {formatVideoTime(remainingSeconds())} {labels.remaining}
            </span>
          </div>
        </Show>
      </div>
      <Show when={error()}>
        <p class="text-sm" role="alert">
          {error()}
        </p>
      </Show>
      <input
        ref={fileInput}
        type="file"
        accept="video/*"
        class="hidden"
        aria-label={labels.uploadVideo}
        onChange={(event) => {
          handlePickedFile(event.currentTarget.files?.[0]);
          event.currentTarget.value = "";
        }}
      />
      <div class="flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          isDisabled={props.isUploading}
          on:click={cancel}
        >
          {labels.cancel}
        </Button>
        <Show
          when={
            props.isFileUploadAllowed &&
            cameraStatus() !== "recording" &&
            !props.isUploading
          }
        >
          <Button
            type="button"
            variant="secondary"
            size="sm"
            on:click={() => fileInput?.click()}
          >
            {clip()?.source === "uploaded"
              ? labels.chooseAnother
              : labels.uploadVideo}
          </Button>
        </Show>
        <Switch>
          <Match when={clip()}>
            <Show when={isCameraAvailable()}>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                isDisabled={props.isUploading}
                on:click={() => void retake()}
              >
                {labels.retake}
              </Button>
            </Show>
            <Button
              type="button"
              size="sm"
              isLoading={props.isUploading}
              isDisabled={props.isUploading}
              on:click={submit}
            >
              {props.isUploading ? labels.uploading : labels.send}
            </Button>
          </Match>
          <Match when={cameraStatus() === "ready"}>
            <Button type="button" size="sm" on:click={startRecording}>
              {labels.record}
            </Button>
          </Match>
          <Match when={cameraStatus() === "recording"}>
            <Button type="button" size="sm" on:click={stopRecording}>
              {labels.stop}
            </Button>
          </Match>
        </Switch>
      </div>
    </div>
  );
};
