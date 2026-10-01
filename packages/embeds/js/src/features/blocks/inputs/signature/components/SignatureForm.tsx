import {
  defaultSignatureInputOptions,
  signatureFileType,
} from "@typebot.io/blocks-inputs/signature/constants";
import type { SignatureInputBlock } from "@typebot.io/blocks-inputs/signature/schema";
import { isDefined } from "@typebot.io/lib/utils";
import { createSignal, onCleanup, onMount, Show } from "solid-js";
import { Button } from "../../../../../components/Button";
import { SendButton } from "../../../../../components/SendButton";
import type { BotContext, InputSubmitContent } from "../../../../../types";
import { guessApiHost } from "../../../../../utils/guessApiHost";
import { toaster } from "../../../../../utils/toaster";
import { uploadFiles } from "../../fileUpload/helpers/uploadFiles";
import { canvasToJpegBlob } from "../helpers/canvasToJpegBlob";

type Props = {
  context: BotContext;
  block: SignatureInputBlock;
  onSubmit: (value: InputSubmitContent) => void;
  onSkip: (label: string) => void;
};

/**
 * Signature pad (finger, pen or mouse). The signature is saved as a JPEG on a
 * white background, uploaded straight to the storage; the answer is its URL.
 */
export const SignatureForm = (props: Props) => {
  let canvas: HTMLCanvasElement | undefined;
  let lastPoint: { x: number; y: number } | undefined;
  let strokeLength = 0;
  const [hasSignature, setHasSignature] = createSignal(false);
  const [isUploading, setIsUploading] = createSignal(false);

  const getContext = () => canvas?.getContext("2d") ?? undefined;

  /** Sharp lines on high density screens; keeps the drawing when resized. */
  const resizeCanvas = () => {
    if (!canvas) return;
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const { width, height } = canvas.getBoundingClientRect();
    if (width === 0 || height === 0) return;
    const previousDrawing =
      hasSignature() && canvas.width > 0 ? canvas.toDataURL() : undefined;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    const context = getContext();
    if (!context) return;
    context.scale(ratio, ratio);
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = 2.5;
    context.strokeStyle = "#111827";
    if (previousDrawing) {
      const image = new Image();
      image.onload = () => context.drawImage(image, 0, 0, width, height);
      image.src = previousDrawing;
    }
  };

  onMount(() => {
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    onCleanup(() => window.removeEventListener("resize", resizeCanvas));
  });

  const getPoint = (event: PointerEvent) => {
    const rect = canvas!.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const startStroke = (event: PointerEvent) => {
    if (!canvas || isUploading()) return;
    event.preventDefault();
    canvas.setPointerCapture(event.pointerId);
    lastPoint = getPoint(event);
    const context = getContext();
    if (!context) return;
    // A tap draws a dot.
    context.beginPath();
    context.arc(lastPoint.x, lastPoint.y, 1.2, 0, Math.PI * 2);
    context.fillStyle = "#111827";
    context.fill();
  };

  const continueStroke = (event: PointerEvent) => {
    if (!lastPoint) return;
    event.preventDefault();
    const context = getContext();
    if (!context) return;
    const point = getPoint(event);
    const midPoint = {
      x: (lastPoint.x + point.x) / 2,
      y: (lastPoint.y + point.y) / 2,
    };
    context.beginPath();
    context.moveTo(lastPoint.x, lastPoint.y);
    context.quadraticCurveTo(lastPoint.x, lastPoint.y, midPoint.x, midPoint.y);
    context.lineTo(point.x, point.y);
    context.stroke();
    strokeLength += Math.hypot(point.x - lastPoint.x, point.y - lastPoint.y);
    lastPoint = point;
    // Ignore accidental taps: a signature needs some ink.
    if (strokeLength > 20) setHasSignature(true);
  };

  const endStroke = () => {
    lastPoint = undefined;
  };

  const clear = () => {
    if (!canvas) return;
    getContext()?.clearRect(0, 0, canvas.width, canvas.height);
    strokeLength = 0;
    setHasSignature(false);
  };

  const submit = async (event: SubmitEvent) => {
    event.preventDefault();
    if (!canvas || !hasSignature() || isUploading()) return;
    setIsUploading(true);
    try {
      const blob = await canvasToJpegBlob(canvas);
      const file = new File([blob], `signature-${Date.now()}.jpg`, {
        type: signatureFileType,
      });
      const result = await uploadFiles({
        apiHost:
          props.context.apiHost ?? guessApiHost({ ignoreChatApiUrl: true }),
        files: [
          {
            file,
            input: {
              sessionId: props.context.sessionId,
              blockId: props.block.id,
              fileName: file.name,
            },
          },
        ],
      });
      const url =
        result.type === "success"
          ? result.urls.find(isDefined)?.url
          : undefined;
      if (!url) {
        toaster.create({
          description:
            result.type === "error" ? result.error : "Could not upload file",
        });
        return;
      }
      props.onSubmit({
        type: "text",
        value: url,
        label: "",
        // Public signatures keep showing after a page reload; private ones
        // can only be opened from the builder, so the local copy is shown.
        previewImageUrl:
          props.block.options?.visibility === "Private"
            ? URL.createObjectURL(blob)
            : url,
      });
    } catch (error) {
      toaster.create({
        description:
          error instanceof Error ? error.message : "Could not upload file",
      });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <form
      class="flex flex-col items-end gap-2 w-full typebot-signature-input"
      onSubmit={submit}
    >
      <Show when={props.block.options?.question}>
        <p class="w-full font-semibold">{props.block.options?.question}</p>
      </Show>
      <div class="relative w-full typebot-signature-pad">
        <canvas
          ref={canvas}
          class="w-full h-44 block touch-none cursor-crosshair rounded-md"
          style={{
            "background-color": "#ffffff",
            border: "1px dashed rgba(0, 0, 0, 0.35)",
          }}
          role="img"
          aria-label={
            props.block.options?.placeholder ??
            defaultSignatureInputOptions.placeholder
          }
          onPointerDown={startStroke}
          onPointerMove={continueStroke}
          onPointerUp={endStroke}
          onPointerCancel={endStroke}
          onPointerLeave={endStroke}
        />
        <Show when={!hasSignature()}>
          <span
            class="pointer-events-none absolute inset-x-4 bottom-4 border-b text-xs pb-1"
            style={{ color: "#6b7280", "border-color": "#9ca3af" }}
          >
            ✍︎{" "}
            {props.block.options?.placeholder ??
              defaultSignatureInputOptions.placeholder}
          </span>
        </Show>
      </div>
      <div class="flex flex-wrap justify-end gap-2">
        <Show
          when={
            !(
              props.block.options?.isRequired ??
              defaultSignatureInputOptions.isRequired
            )
          }
        >
          <Button
            type="button"
            variant="secondary"
            isDisabled={isUploading()}
            on:click={() =>
              props.onSkip(
                props.block.options?.skipLabel ??
                  defaultSignatureInputOptions.skipLabel,
              )
            }
          >
            {props.block.options?.skipLabel ??
              defaultSignatureInputOptions.skipLabel}
          </Button>
        </Show>
        <Button
          type="button"
          variant="secondary"
          isDisabled={!hasSignature() || isUploading()}
          on:click={clear}
        >
          {props.block.options?.clearLabel ??
            defaultSignatureInputOptions.clearLabel}
        </Button>
        <SendButton
          disableIcon
          isLoading={isUploading()}
          isDisabled={!hasSignature() || isUploading()}
        >
          {props.block.options?.buttonLabel ??
            defaultSignatureInputOptions.buttonLabel}
        </SendButton>
      </div>
    </form>
  );
};
