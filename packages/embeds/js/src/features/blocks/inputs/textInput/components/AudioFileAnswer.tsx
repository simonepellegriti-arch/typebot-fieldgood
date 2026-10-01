import { createMemo, onCleanup, Show } from "solid-js";
import { Button } from "../../../../../components/Button";
import { checkMediaAnswerFile } from "../../../../../components/media/checkMediaAnswerFile";
import { getMediaAnswerLabels } from "../../../../../components/media/getMediaAnswerLabels";
import { withInferredMediaFileType } from "../../../../../components/media/withInferredMediaFileType";

type Props = {
  file: File;
  maxFileSizeMB: number;
  isUploading: boolean;
  onSubmit: (file: File) => void;
  onChooseAnother: (file: File) => void;
  onCancel: () => void;
};

/**
 * Review of an audio file picked by the respondent as the answer of an open
 * question: listen, choose another file or send.
 */
export const AudioFileAnswer = (props: Props) => {
  const labels = getMediaAnswerLabels();
  let fileInput: HTMLInputElement | undefined;

  const problem = () =>
    checkMediaAnswerFile({
      file: props.file,
      kind: "audio",
      maxFileSizeMB: props.maxFileSizeMB,
    });

  // A preview URL per picked file, released when the file changes or on unmount.
  const blobUrl = createMemo<string | undefined>((previousUrl) => {
    if (previousUrl) URL.revokeObjectURL(previousUrl);
    return URL.createObjectURL(props.file);
  });
  onCleanup(() => {
    const url = blobUrl();
    if (url) URL.revokeObjectURL(url);
  });

  return (
    <div class="flex flex-col gap-2 w-full typebot-audio-file-answer">
      <Show
        when={!problem()}
        fallback={
          <p class="text-sm" role="alert">
            {problem() === "wrongType"
              ? labels.wrongAudioType
              : labels.tooLarge.replace("{size}", String(props.maxFileSizeMB))}
          </p>
        }
      >
        <p class="text-sm truncate">{props.file.name}</p>
        {/* biome-ignore lint/a11y/useMediaCaption: Captions are not available for user-submitted recordings. */}
        <audio controls src={blobUrl()} class="w-full" />
      </Show>
      <input
        ref={fileInput}
        type="file"
        accept="audio/*"
        class="hidden"
        aria-label={labels.uploadAudio}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (file) props.onChooseAnother(withInferredMediaFileType(file));
        }}
      />
      <div class="flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          isDisabled={props.isUploading}
          on:click={props.onCancel}
        >
          {labels.cancel}
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          isDisabled={props.isUploading}
          on:click={() => fileInput?.click()}
        >
          {labels.chooseAnother}
        </Button>
        <Button
          type="button"
          size="sm"
          isLoading={props.isUploading}
          isDisabled={props.isUploading || problem() !== undefined}
          on:click={() => props.onSubmit(props.file)}
        >
          {props.isUploading ? labels.uploading : labels.sendAudio}
        </Button>
      </div>
    </div>
  );
};
