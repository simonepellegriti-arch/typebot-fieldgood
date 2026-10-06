import {
  defaultPhotoInputOptions,
  photoFileType,
  photoUrlsSeparator,
} from "@typebot.io/blocks-inputs/photo/constants";
import type { PhotoInputBlock } from "@typebot.io/blocks-inputs/photo/schema";
import { isDefined } from "@typebot.io/lib/utils";
import { createSignal, For, onCleanup, Show } from "solid-js";
import { Button } from "../../../../../components/Button";
import { CameraIcon } from "../../../../../components/icons/CameraIcon";
import { CloseIcon } from "../../../../../components/icons/CloseIcon";
import { SendButton } from "../../../../../components/SendButton";
import type { BotContext, InputSubmitContent } from "../../../../../types";
import { guessApiHost } from "../../../../../utils/guessApiHost";
import { toaster } from "../../../../../utils/toaster";
import { uploadFiles } from "../../fileUpload/helpers/uploadFiles";
import { drawImageToJpegBlob } from "../helpers/drawImageToJpegBlob";
import { getPhotoAnswerLabels } from "../helpers/getPhotoAnswerLabels";
import { imageFileToJpegBlob } from "../helpers/imageFileToJpegBlob";

type Props = {
  context: BotContext;
  block: PhotoInputBlock;
  onSubmit: (value: InputSubmitContent) => void;
  onSkip: (label: string) => void;
};

type Photo = { id: string; blob: Blob; previewUrl: string };

type CameraStatus = "closed" | "requesting" | "ready" | "failed";

/**
 * Photo answer: the camera opens inside the chat (rear camera by default),
 * the respondent takes one or more photos, reviews / removes them and sends.
 * Photos are resized and saved as JPEG, uploaded straight to the storage;
 * the answer is their links. When the browser can't open the camera, the
 * phone camera app is used instead (and the gallery when allowed).
 */
export const PhotoForm = (props: Props) => {
  const labels = getPhotoAnswerLabels();
  const [photos, setPhotos] = createSignal<Photo[]>([]);
  const [cameraStatus, setCameraStatus] = createSignal<CameraStatus>("closed");
  const [facingMode, setFacingMode] = createSignal<"environment" | "user">(
    props.block.options?.facingMode ?? defaultPhotoInputOptions.facingMode,
  );
  const [hasSeveralCameras, setHasSeveralCameras] = createSignal(false);
  const [isProcessing, setIsProcessing] = createSignal(false);
  const [isUploading, setIsUploading] = createSignal(false);
  const [error, setError] = createSignal<string>();
  let video: HTMLVideoElement | undefined;
  let phoneCameraInput: HTMLInputElement | undefined;
  let galleryInput: HTMLInputElement | undefined;
  let stream: MediaStream | undefined;
  let isSubmitted = false;

  const maxPhotos = () =>
    props.block.options?.maxPhotos ?? defaultPhotoInputOptions.maxPhotos;
  const isRequired = () =>
    props.block.options?.isRequired ?? defaultPhotoInputOptions.isRequired;
  const isGalleryAllowed = () =>
    (props.block.options?.source ?? defaultPhotoInputOptions.source) ===
    "cameraOrGallery";
  const canAddPhotos = () => photos().length < maxPhotos();
  const isBusy = () => isProcessing() || isUploading();
  const formatCount = (template: string) =>
    template
      .replace("{count}", String(photos().length))
      .replace("{max}", String(maxPhotos()));

  const openCamera = async () => {
    setError(undefined);
    // No camera API (old browser, in-app web view): the phone camera app.
    if (!navigator.mediaDevices?.getUserMedia) {
      phoneCameraInput?.click();
      return;
    }
    setCameraStatus("requesting");
    try {
      releaseCamera();
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facingMode() },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      if (video) {
        video.srcObject = stream;
        void video.play().catch(() => {});
      }
      setCameraStatus("ready");
      void detectSeveralCameras();
    } catch {
      releaseCamera();
      setCameraStatus("failed");
    }
  };

  const detectSeveralCameras = async () => {
    const devices = await navigator.mediaDevices
      .enumerateDevices()
      .catch(() => []);
    setHasSeveralCameras(
      devices.filter((device) => device.kind === "videoinput").length > 1,
    );
  };

  const switchCamera = () => {
    setFacingMode((current) =>
      current === "environment" ? "user" : "environment",
    );
    void openCamera();
  };

  const releaseCamera = () => {
    for (const track of stream?.getTracks() ?? []) track.stop();
    stream = undefined;
    if (video) video.srcObject = null;
  };

  const closeCamera = () => {
    releaseCamera();
    setCameraStatus("closed");
  };

  const addPhoto = (blob: Blob) =>
    setPhotos((current) => [
      ...current,
      {
        id: `${Date.now()}-${current.length}`,
        blob,
        previewUrl: URL.createObjectURL(blob),
      },
    ]);

  const takePhoto = async () => {
    if (!video || cameraStatus() !== "ready" || !canAddPhotos()) return;
    setIsProcessing(true);
    try {
      addPhoto(
        await drawImageToJpegBlob({
          source: video,
          width: video.videoWidth,
          height: video.videoHeight,
        }),
      );
      closeCamera();
    } catch {
      setError(labels.uploadFailed);
    } finally {
      setIsProcessing(false);
    }
  };

  const addPickedFiles = async (files: FileList | null | undefined) => {
    const pickedFiles = Array.from(files ?? []);
    if (pickedFiles.length === 0) return;
    setError(undefined);
    closeCamera();
    setIsProcessing(true);
    try {
      for (const file of pickedFiles) {
        if (!canAddPhotos()) {
          setError(formatCount(labels.maxReached));
          break;
        }
        if (file.type && !file.type.startsWith("image/")) {
          setError(labels.wrongType);
          continue;
        }
        const blob = await imageFileToJpegBlob(file).catch(() => undefined);
        if (blob) addPhoto(blob);
        else setError(labels.wrongType);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const removePhoto = (photoId: string) =>
    setPhotos((current) =>
      current.filter((photo) => {
        if (photo.id !== photoId) return true;
        URL.revokeObjectURL(photo.previewUrl);
        return false;
      }),
    );

  const retake = () => {
    const [onlyPhoto] = photos();
    if (onlyPhoto) removePhoto(onlyPhoto.id);
    void openCamera();
  };

  const submit = async (event: SubmitEvent) => {
    event.preventDefault();
    const photosToSend = photos();
    if (photosToSend.length === 0 || isBusy()) return;
    setIsUploading(true);
    setError(undefined);
    try {
      const timestamp = Date.now();
      const files = photosToSend.map(
        (photo, index) =>
          new File([photo.blob], `photo-${timestamp}-${index + 1}.jpg`, {
            type: photoFileType,
          }),
      );
      const result = await uploadFiles({
        apiHost:
          props.context.apiHost ?? guessApiHost({ ignoreChatApiUrl: true }),
        files: files.map((file) => ({
          file,
          input: {
            sessionId: props.context.sessionId,
            blockId: props.block.id,
            fileName: file.name,
          },
        })),
      });
      const urls =
        result.type === "success"
          ? result.urls.filter(isDefined).map((uploaded) => uploaded.url)
          : [];
      if (urls.length !== photosToSend.length) {
        toaster.create({
          description:
            result.type === "error" ? result.error : labels.uploadFailed,
        });
        return;
      }
      isSubmitted = true;
      releaseCamera();
      props.onSubmit({
        type: "text",
        value: urls.join(photoUrlsSeparator),
        label: "",
        // Public photos keep showing after a page reload; private ones can
        // only be opened from the builder, so the local copies are shown.
        previewImageUrls:
          props.block.options?.visibility === "Private"
            ? photosToSend.map((photo) => photo.previewUrl)
            : urls,
      });
    } catch (uploadError) {
      toaster.create({
        description:
          uploadError instanceof Error
            ? uploadError.message
            : labels.uploadFailed,
      });
    } finally {
      setIsUploading(false);
    }
  };

  onCleanup(() => {
    releaseCamera();
    if (isSubmitted && props.block.options?.visibility === "Private") return;
    for (const photo of photos()) URL.revokeObjectURL(photo.previewUrl);
  });

  const isCameraOpen = () =>
    cameraStatus() === "requesting" || cameraStatus() === "ready";

  return (
    <form
      class="flex flex-col items-end gap-2 w-full typebot-photo-input"
      onSubmit={submit}
    >
      <Show when={props.block.options?.question}>
        <p class="w-full font-semibold">{props.block.options?.question}</p>
      </Show>

      <div
        class={
          isCameraOpen()
            ? "relative w-full overflow-hidden rounded-md bg-black"
            : "hidden"
        }
      >
        <video
          ref={(element) => {
            video = element;
            element.setAttribute("playsinline", "");
            element.setAttribute("webkit-playsinline", "");
          }}
          class="w-full max-h-[60vh] object-contain block"
          style={{
            transform: facingMode() === "user" ? "scaleX(-1)" : undefined,
          }}
          autoplay
          muted
          data-testid="photo-camera-preview"
        />
        <Show when={cameraStatus() === "requesting"}>
          <p class="absolute inset-0 flex items-center justify-center text-white text-sm p-4 text-center">
            {labels.requesting}
          </p>
        </Show>
        <Show when={cameraStatus() === "ready"}>
          <div class="absolute inset-x-0 bottom-3 flex items-center justify-center">
            <button
              type="button"
              class="size-16 rounded-full border-4 border-white bg-white/30 active:bg-white/70 cursor-pointer disabled:opacity-50"
              aria-label={labels.shutter}
              disabled={isProcessing()}
              onClick={() => void takePhoto()}
            />
          </div>
        </Show>
      </div>

      <Show when={photos().length > 0 && !isCameraOpen()}>
        <div
          class={
            maxPhotos() === 1
              ? "w-full"
              : "w-full grid grid-cols-3 gap-2 typebot-photo-grid"
          }
        >
          <For each={photos()}>
            {(photo) => (
              <div class="relative">
                <img
                  src={photo.previewUrl}
                  alt={labels.openPhoto}
                  data-testid="photo-preview"
                  class={
                    maxPhotos() === 1
                      ? "w-full max-h-[50vh] object-contain rounded-md bg-black/5"
                      : "w-full aspect-square object-cover rounded-md bg-black/5"
                  }
                />
                <Show when={maxPhotos() > 1}>
                  <button
                    type="button"
                    class="absolute top-1 right-1 size-7 rounded-full bg-black/60 text-white flex items-center justify-center cursor-pointer"
                    aria-label={labels.remove}
                    disabled={isBusy()}
                    onClick={() => removePhoto(photo.id)}
                  >
                    <CloseIcon class="size-4" />
                  </button>
                </Show>
              </div>
            )}
          </For>
        </div>
      </Show>

      <Show when={cameraStatus() === "failed"}>
        <p class="w-full text-sm" role="alert">
          {labels.permissionDenied}
        </p>
      </Show>
      <Show when={error()}>
        <p class="w-full text-sm" role="alert">
          {error()}
        </p>
      </Show>
      <Show when={isProcessing()}>
        <p class="w-full text-sm" aria-live="polite">
          {labels.processing}
        </p>
      </Show>
      <Show when={maxPhotos() > 1 && photos().length > 0}>
        <p class="w-full text-xs opacity-70" aria-live="polite">
          {formatCount(labels.counter)}
        </p>
      </Show>

      <input
        ref={phoneCameraInput}
        type="file"
        accept="image/*"
        capture={facingMode()}
        class="hidden"
        aria-label={labels.openPhoneCamera}
        data-testid="photo-phone-camera-input"
        onChange={(event) => {
          void addPickedFiles(event.currentTarget.files);
          event.currentTarget.value = "";
        }}
      />
      <input
        ref={galleryInput}
        type="file"
        accept="image/*"
        multiple={maxPhotos() > 1}
        class="hidden"
        aria-label={labels.chooseFromGallery}
        data-testid="photo-gallery-input"
        onChange={(event) => {
          void addPickedFiles(event.currentTarget.files);
          event.currentTarget.value = "";
        }}
      />

      <div class="flex flex-wrap justify-end gap-2">
        <Show when={!isRequired() && photos().length === 0 && !isCameraOpen()}>
          <Button
            type="button"
            variant="secondary"
            isDisabled={isBusy()}
            on:click={() =>
              props.onSkip(
                props.block.options?.skipLabel ??
                  defaultPhotoInputOptions.skipLabel,
              )
            }
          >
            {props.block.options?.skipLabel ??
              defaultPhotoInputOptions.skipLabel}
          </Button>
        </Show>

        <Show when={isCameraOpen()}>
          <Button type="button" variant="secondary" on:click={closeCamera}>
            {labels.cancel}
          </Button>
          <Show when={hasSeveralCameras()}>
            <Button
              type="button"
              variant="secondary"
              isDisabled={cameraStatus() !== "ready"}
              on:click={switchCamera}
            >
              {labels.switchCamera}
            </Button>
          </Show>
        </Show>

        <Show when={!isCameraOpen() && canAddPhotos()}>
          <Show when={isGalleryAllowed()}>
            <Button
              type="button"
              variant="secondary"
              isDisabled={isBusy()}
              on:click={() => galleryInput?.click()}
            >
              {labels.chooseFromGallery}
            </Button>
          </Show>
          <Show when={cameraStatus() === "failed"}>
            <Button
              type="button"
              variant="secondary"
              isDisabled={isBusy()}
              on:click={() => phoneCameraInput?.click()}
            >
              {labels.openPhoneCamera}
            </Button>
          </Show>
          <Button
            type="button"
            variant={photos().length > 0 ? "secondary" : "primary"}
            isDisabled={isBusy()}
            on:click={() => void openCamera()}
            class="items-center gap-2"
          >
            <CameraIcon class="size-5" aria-hidden="true" />
            {photos().length > 0 ? labels.takeAnother : labels.takePhoto}
          </Button>
        </Show>

        <Show
          when={!isCameraOpen() && maxPhotos() === 1 && photos().length > 0}
        >
          <Button
            type="button"
            variant="secondary"
            isDisabled={isBusy()}
            on:click={retake}
          >
            {labels.retake}
          </Button>
        </Show>

        <Show when={photos().length > 0 && !isCameraOpen()}>
          <SendButton
            disableIcon
            isLoading={isUploading()}
            isDisabled={isBusy()}
          >
            {isUploading()
              ? labels.uploading
              : (props.block.options?.buttonLabel ??
                defaultPhotoInputOptions.buttonLabel)}
          </SendButton>
        </Show>
      </div>
    </form>
  );
};
