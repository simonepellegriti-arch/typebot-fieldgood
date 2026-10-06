import { useQueryClient } from "@tanstack/react-query";
import { useTranslate } from "@tolgee/react";
import { Button } from "@typebot.io/ui/components/Button";
import { Cancel01Icon } from "@typebot.io/ui/icons/Cancel01Icon";
import { FileEmpty02Icon } from "@typebot.io/ui/icons/FileEmpty02Icon";
import { LoaderCircleIcon } from "@typebot.io/ui/icons/LoaderCircleIcon";
import { SparklesIcon } from "@typebot.io/ui/icons/SparklesIcon";
import { Upload01Icon } from "@typebot.io/ui/icons/Upload01Icon";
import { cn } from "@typebot.io/ui/lib/cn";
import Link from "next/link";
import {
  type DragEvent,
  type FormEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { z } from "zod";
import { useWorkspace } from "@/features/workspace/WorkspaceProvider";
import { orpc } from "@/lib/queryClient";
import {
  extractQuestionnaireDocument,
  type QuestionnaireDocument,
  QuestionnaireDocumentError,
} from "../helpers/extractQuestionnaireDocument";
import {
  type QuestionnaireSpec,
  questionnaireSpecSchema,
} from "../questionnaireSpecSchema";

type ChatMessage =
  | { role: "user"; text: string; fileNames: string[] }
  | {
      role: "assistant";
      text: string;
      notes?: string[];
      typebot?: { id: string; name: string };
      isError?: boolean;
    };

const maxDocuments = 3;
const acceptedExtensions = ".docx,.xlsx,.pptx,.pdf,.txt,.md,.csv";
const progressStepKeys = [
  "questionnaireAssistant.progress.reading",
  "questionnaireAssistant.progress.questions",
  "questionnaireAssistant.progress.routing",
  "questionnaireAssistant.progress.building",
] as const;

/**
 * Chat in the bottom right corner of the Home: attach a questionnaire
 * (Word, Excel, PowerPoint, PDF, text), add instructions, and the bot is
 * created. Later messages edit the bot of the conversation.
 */
export const QuestionnaireAssistant = () => {
  const { t } = useTranslate();
  const { workspace, currentUserMode } = useWorkspace();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [documents, setDocuments] = useState<QuestionnaireDocument[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [progressStep, setProgressStep] = useState(0);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [conversationBot, setConversationBot] = useState<{
    typebotId: string;
    spec: QuestionnaireSpec;
  }>();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isSending]);

  useEffect(() => {
    if (!isSending) return;
    setProgressStep(0);
    const interval = setInterval(
      () =>
        setProgressStep((step) =>
          Math.min(step + 1, progressStepKeys.length - 1),
        ),
      12_000,
    );
    return () => clearInterval(interval);
  }, [isSending]);

  if (!workspace || currentUserMode === "guest") return null;

  const addFiles = async (files: File[]) => {
    for (const file of files) {
      if (documents.length >= maxDocuments) break;
      try {
        const document = await extractQuestionnaireDocument({
          fileName: file.name,
          bytes: new Uint8Array(await file.arrayBuffer()),
        });
        setDocuments((current) =>
          current.length >= maxDocuments ? current : [...current, document],
        );
      } catch (error) {
        const reason =
          error instanceof QuestionnaireDocumentError
            ? error.reason
            : "unreadable";
        setMessages((current) => [
          ...current,
          {
            role: "assistant",
            isError: true,
            text: t(`questionnaireAssistant.fileError.${reason}`, {
              fileName: file.name,
            }),
          },
        ]);
      }
    }
  };

  const send = async (event?: FormEvent) => {
    event?.preventDefault();
    if (isSending || (!draft.trim() && documents.length === 0)) return;
    const message = draft.trim();
    const sentDocuments = documents;
    setMessages((current) => [
      ...current,
      {
        role: "user",
        text: message,
        fileNames: sentDocuments.map((document) => document.fileName),
      },
    ]);
    setDraft("");
    setDocuments([]);
    setIsSending(true);
    try {
      const response = await fetch("/api/questionnaire-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: workspace.id,
          message,
          documents: sentDocuments,
          previousSpec: conversationBot?.spec,
          typebotId: conversationBot?.typebotId,
        }),
      });
      const body: unknown = await response.json().catch(() => undefined);
      const parsedBody = successBodySchema.safeParse(body);
      if (!response.ok || !parsedBody.success) {
        const details = readField(body, "details");
        setMessages((current) => [
          ...current,
          {
            role: "assistant",
            isError: true,
            text: t(
              `questionnaireAssistant.error.${toErrorCode(readField(body, "error"))}`,
            ),
            notes: details ? [details] : undefined,
          },
        ]);
        return;
      }
      const result = parsedBody.data;
      setConversationBot({ typebotId: result.typebotId, spec: result.spec });
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          text: result.reply,
          notes: result.notes,
          typebot: { id: result.typebotId, name: result.typebotName },
        },
      ]);
      void queryClient.invalidateQueries({
        queryKey: orpc.typebot.listTypebots.key(),
      });
    } catch {
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          isError: true,
          text: t("questionnaireAssistant.error.network"),
        },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  const startNewConversation = () => {
    setMessages([]);
    setConversationBot(undefined);
    setDocuments([]);
    setDraft("");
  };

  const handleDrop = (event: DragEvent) => {
    event.preventDefault();
    setIsDraggingOver(false);
    void addFiles([...event.dataTransfer.files]);
  };

  if (!isOpen)
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-orange-9 px-5 py-3 text-gray-1 shadow-lg transition-colors hover:bg-orange-10 dark:text-gray-12"
      >
        <SparklesIcon className="size-5" />
        <span className="font-medium">{t("questionnaireAssistant.open")}</span>
      </button>
    );

  return (
    <section
      aria-label={t("questionnaireAssistant.title")}
      className={cn(
        "fixed bottom-6 right-6 z-40 flex h-[min(620px,calc(100dvh-3rem))] w-[min(420px,calc(100vw-3rem))] flex-col overflow-hidden rounded-xl border border-gray-6 bg-gray-1 shadow-2xl",
        isDraggingOver && "ring-2 ring-orange-8",
      )}
      onDragOver={(event) => {
        event.preventDefault();
        setIsDraggingOver(true);
      }}
      onDragLeave={() => setIsDraggingOver(false)}
      onDrop={handleDrop}
    >
      <header className="flex items-center justify-between gap-2 border-b border-gray-5 px-4 py-3">
        <div className="flex items-center gap-2">
          <SparklesIcon className="size-5 text-orange-9" />
          <h2 className="font-semibold">{t("questionnaireAssistant.title")}</h2>
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <Button
              size="xs"
              variant="ghost"
              disabled={isSending}
              onClick={startNewConversation}
            >
              {t("questionnaireAssistant.newConversation")}
            </Button>
          )}
          <Button
            size="icon"
            variant="ghost"
            aria-label={t("questionnaireAssistant.close")}
            onClick={() => setIsOpen(false)}
          >
            <Cancel01Icon />
          </Button>
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-3">
        {messages.length === 0 && (
          <div className="flex flex-col gap-2 rounded-lg bg-gray-2 p-3 text-sm text-gray-11">
            <p>{t("questionnaireAssistant.welcome")}</p>
            <p>{t("questionnaireAssistant.welcomeFormats")}</p>
          </div>
        )}
        {messages.map((message, index) =>
          message.role === "user" ? (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: messages are only appended.
              key={index}
              className="ml-8 flex flex-col gap-1 self-end rounded-lg bg-orange-3 px-3 py-2 text-sm"
            >
              {message.fileNames.map((fileName) => (
                <span
                  key={fileName}
                  className="flex items-center gap-1 font-medium"
                >
                  <FileEmpty02Icon className="size-4" />
                  {fileName}
                </span>
              ))}
              {message.text && (
                <p className="whitespace-pre-wrap">{message.text}</p>
              )}
            </div>
          ) : (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: messages are only appended.
              key={index}
              className={cn(
                "mr-8 flex flex-col gap-2 rounded-lg px-3 py-2 text-sm",
                message.isError ? "bg-red-3 text-red-11" : "bg-gray-3",
              )}
            >
              <p className="whitespace-pre-wrap">{message.text}</p>
              {message.notes && message.notes.length > 0 && (
                <div className="flex flex-col gap-1">
                  {!message.isError && (
                    <p className="font-medium">
                      {t("questionnaireAssistant.notesTitle")}
                    </p>
                  )}
                  <ul className="list-disc pl-5">
                    {message.notes.map((note) => (
                      <li key={note}>{note}</li>
                    ))}
                  </ul>
                </div>
              )}
              {message.typebot && (
                <div className="flex flex-col gap-1">
                  <Button
                    size="sm"
                    className="self-start"
                    render={
                      <Link href={`/typebots/${message.typebot.id}/edit`} />
                    }
                  >
                    {t("questionnaireAssistant.openBot", {
                      name: message.typebot.name,
                    })}
                  </Button>
                  <p className="text-xs text-gray-10">
                    {t("questionnaireAssistant.editHint")}
                  </p>
                </div>
              )}
            </div>
          ),
        )}
        {isSending && (
          <div className="mr-8 flex items-center gap-2 self-start rounded-lg bg-gray-3 px-3 py-2 text-sm">
            <LoaderCircleIcon className="size-4 animate-spin" />
            {t(progressStepKeys[progressStep] ?? progressStepKeys[0])}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <form
        onSubmit={send}
        className="flex flex-col gap-2 border-t border-gray-5 px-3 py-3"
      >
        {documents.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {documents.map((document) => (
              <span
                key={document.fileName}
                className="flex items-center gap-1 rounded-md border border-gray-6 px-2 py-1 text-xs"
              >
                <FileEmpty02Icon className="size-3.5" />
                <span className="max-w-[200px] truncate">
                  {document.fileName}
                </span>
                <button
                  type="button"
                  aria-label={t("questionnaireAssistant.removeFile")}
                  onClick={() =>
                    setDocuments((current) =>
                      current.filter((item) => item !== document),
                    )
                  }
                >
                  <Cancel01Icon className="size-3.5" />
                </button>
              </span>
            ))}
          </div>
        )}
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void send();
            }
          }}
          rows={3}
          disabled={isSending}
          placeholder={
            conversationBot
              ? t("questionnaireAssistant.placeholderEdit")
              : t("questionnaireAssistant.placeholder")
          }
          className="w-full resize-none rounded-md border border-gray-6 bg-gray-1 px-3 py-2 text-sm outline-none focus:border-orange-8"
        />
        <div className="flex items-center justify-between gap-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={acceptedExtensions}
            className="hidden"
            onChange={(event) => {
              const files = [...(event.target.files ?? [])];
              event.target.value = "";
              void addFiles(files);
            }}
          />
          <Button
            type="button"
            size="sm"
            variant="outline-secondary"
            disabled={isSending || documents.length >= maxDocuments}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload01Icon />
            {t("questionnaireAssistant.attach")}
          </Button>
          <Button
            type="submit"
            size="sm"
            disabled={isSending || (!draft.trim() && documents.length === 0)}
          >
            {conversationBot
              ? t("questionnaireAssistant.sendEdit")
              : t("questionnaireAssistant.send")}
          </Button>
        </div>
      </form>
    </section>
  );
};

const successBodySchema = z.object({
  typebotId: z.string(),
  typebotName: z.string(),
  reply: z.string(),
  notes: z.array(z.string()),
  spec: questionnaireSpecSchema,
});

const knownErrorCodes = [
  "no-ai-credentials",
  "ai-failed",
  "no-questions",
  "typebot-not-found",
  "empty-request",
  "invalid-request",
  "unauthenticated",
] as const;

const toErrorCode = (value: unknown) =>
  knownErrorCodes.find((errorCode) => errorCode === value) ?? "unknown";

const readField = (body: unknown, field: string) => {
  const value =
    typeof body === "object" && body !== null
      ? Object.entries(body).find(([key]) => key === field)?.[1]
      : undefined;
  return typeof value === "string" ? value : undefined;
};
