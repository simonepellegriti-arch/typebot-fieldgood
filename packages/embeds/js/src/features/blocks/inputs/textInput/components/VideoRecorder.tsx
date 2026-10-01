import { fixWebmDuration } from "@fix-webm-duration/fix";
import { maxVideoClipUploadBytes } from "@typebot.io/blocks-inputs/text/videoClipConstants";
import {
  createSignal,
  Match,
  onCleanup,
  onMount,
  Show,
  Switch,
} from "solid-js";
import { Button } from "../../../../../components/Button";
import { computeVideoRecordingBitrate } from "../../../../../components/media/computeVideoRecordingBitrate";
import { formatVideoTime } from "../../../../../components/media/formatVideoTime";
import { getVideoRecorderLabels } from "../../../../../components/media/getVideoRecorderLabels";
import {
  pickVideoRecordingFormat,
  type VideoRecordingFormat,
} from "../../../../../components/media/pickVideoRecordingFormat";

type Props = {
  maxDurationSeconds: number;
  isUploading: boolean;
  onSubmit: (file: File) => void;
  onCancel: () => void;
};

type Status =
  | "requesting"
  | "ready"
  | "recording"
  | "review"
  | "permissionDenied"
  | "unsupported";

/**
 * Video answer recorder for open questions: live camera preview (inline on
 * iPhone), recording limited to the configured duration, review of the clip,
 * "record again" and send. The camera is released as soon as it isn't needed.
 */
export const VideoRecorder = (props: Props) => {
  const labels = getVideoRecorderLabels();
  const [status, setStatus] = createSignal<Status>("requesting");
  const [elapsedSeconds, setElapsedSeconds] = createSignal(0);
  const [recordedClip, setRecordedClip] = createSignal<{
    file: File;
    blobUrl: string;
  }>();
  const [error, setError] = createSignal<string>();
  let previewVideo: HTMLVideoElement | undefined;
  let stream: MediaStream | undefined;
  let mediaRecorder: MediaRecorder | undefined;
  let recordedChunks: Blob[] = [];
  let recordingStartedAt = 0;
  let elapsedInterval: ReturnType<typeof setInterval> | undefined;
  let format: VideoRecordingFormat | undefined;

  const openCamera = async () => {
    format =
      typeof MediaRecorder !== "undefined"
        ? pickVideoRecordingFormat((mimeType) =>
            MediaRecorder.isTypeSupported(mimeType),
          )
        : undefined;
    if (!format || !navigator.mediaDevices?.getUserMedia)
      return setStatus("unsupported");
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
      setStatus("ready");
    } catch {
      setStatus("permissionDenied");
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

  const startRecording = () => {
    if (!stream || !format) return;
    setError(undefined);
    recordedChunks = [];
    mediaRecorder = new MediaRecorder(stream, {
      mimeType: format.mimeType,
      ...computeVideoRecordingBitrate(props.maxDurationSeconds),
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
    setStatus("recording");
  };

  const stopRecording = () => {
    if (elapsedInterval) clearInterval(elapsedInterval);
    elapsedInterval = undefined;
    if (mediaRecorder && mediaRecorder.state !== "inactive")
      mediaRecorder.stop();
  };

  const finishRecording = async () => {
    if (!format || recordedChunks.length === 0) return setStatus("ready");
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
    if (file.size > maxVideoClipUploadBytes) {
      setError(labels.tooLarge);
      return setStatus("ready");
    }
    const blobUrl = URL.createObjectURL(file);
    setRecordedClip({ file, blobUrl });
    setStatus("review");
    if (previewVideo) {
      previewVideo.srcObject = null;
      previewVideo.src = blobUrl;
      previewVideo.muted = false;
      previewVideo.controls = true;
    }
  };

  const retake = async () => {
    const clip = recordedClip();
    if (clip) URL.revokeObjectURL(clip.blobUrl);
    setRecordedClip(undefined);
    // The camera is released when a clip is sent: reopen it if needed.
    if (!stream) return openCamera();
    showLivePreview();
    setStatus("ready");
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
    const clip = recordedClip();
    if (!clip) return;
    releaseCamera();
    props.onSubmit(clip.file);
  };

  const cancel = () => {
    releaseCamera();
    props.onCancel();
  };

  onMount(() => void openCamera());
  onCleanup(releaseCamera);

  const remainingSeconds = () =>
    Math.max(0, props.maxDurationSeconds - elapsedSeconds());

  return (
    <div class="flex flex-col gap-2 w-full typebot-video-recorder">
      <Switch>
        <Match when={status() === "unsupported"}>
          <p class="text-sm" role="alert">
            {labels.unsupported}
          </p>
        </Match>
        <Match when={status() === "permissionDenied"}>
          <p class="text-sm" role="alert">
            {labels.permissionDenied}
          </p>
        </Match>
      </Switch>
      <Show
        when={status() !== "unsupported" && status() !== "permissionDenied"}
      >
        <div class="relative w-full overflow-hidden rounded-md bg-black/80">
          <video
            ref={(video) => {
              previewVideo = video;
              video.setAttribute("playsinline", "");
              video.setAttribute("webkit-playsinline", "");
            }}
            class="w-full aspect-video object-cover"
            autoplay
            muted
          />
          <Show when={status() === "requesting"}>
            <p class="absolute inset-0 flex items-center justify-center text-white text-sm p-4 text-center">
              {labels.requesting}
            </p>
          </Show>
          <Show when={status() === "recording"}>
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
      </Show>
      <Show when={error()}>
        <p class="text-sm" role="alert">
          {error()}
        </p>
      </Show>
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
        <Switch>
          <Match when={status() === "ready"}>
            <Button type="button" size="sm" on:click={startRecording}>
              {labels.record}
            </Button>
          </Match>
          <Match when={status() === "recording"}>
            <Button type="button" size="sm" on:click={stopRecording}>
              {labels.stop}
            </Button>
          </Match>
          <Match when={status() === "review"}>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              isDisabled={props.isUploading}
              on:click={() => void retake()}
            >
              {labels.retake}
            </Button>
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
        </Switch>
      </div>
    </div>
  );
};
