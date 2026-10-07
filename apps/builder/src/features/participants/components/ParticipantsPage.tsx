import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslate } from "@tolgee/react";
import {
  type ParticipantStatus,
  participantStatuses,
} from "@typebot.io/bot-engine/participants/schemas";
import { Alert } from "@typebot.io/ui/components/Alert";
import { AlertDialog } from "@typebot.io/ui/components/AlertDialog";
import { Badge } from "@typebot.io/ui/components/Badge";
import { Button, buttonVariants } from "@typebot.io/ui/components/Button";
import { Input } from "@typebot.io/ui/components/Input";
import { Table } from "@typebot.io/ui/components/Table";
import { useId, useRef, useState } from "react";
import { CopyButton } from "@/components/CopyButton";
import { Seo } from "@/components/Seo";
import { TypebotHeader } from "@/features/editor/components/TypebotHeader";
import { useTypebot } from "@/features/editor/providers/TypebotProvider";
import { orpc } from "@/lib/queryClient";
import { toast } from "@/lib/toast";
import { downloadParticipantLinks } from "../helpers/downloadParticipantLinks";
import {
  type ParticipantList,
  readParticipantList,
} from "../helpers/readParticipantList";
import { AirtableDashboardCard } from "./AirtableDashboardCard";
import { ImportParticipantsDialog } from "./ImportParticipantsDialog";

const maxDisplayedRows = 300;

const statusColors = {
  NOT_STARTED: "gray",
  IN_PROGRESS: "orange",
  COMPLETED: "green",
} as const;

/**
 * Respondent list of a bot: upload (Excel / CSV), column mapping, personal
 * links to export, progress of each participant and the Airtable dashboard.
 */
export const ParticipantsPage = () => {
  const { t } = useTranslate();
  const { typebot, publishedTypebot, currentUserMode } = useTypebot();
  const [pendingList, setPendingList] = useState<{
    list: ParticipantList;
    fileName: string;
  }>();
  const [search, setSearch] = useState("");
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const deleteCancelRef = useRef<HTMLButtonElement>(null);
  const fileInputId = useId();

  const { data, refetch } = useQuery(
    orpc.participants.getParticipants.queryOptions({
      input: { typebotId: typebot?.id ?? "" },
      enabled: Boolean(typebot?.id),
    }),
  );

  const { mutate: deleteParticipants } = useMutation(
    orpc.participants.deleteParticipants.mutationOptions({
      onSuccess: (result) => {
        toast({
          description: t("participants.deleted", {
            count: result.deletedCount,
          }),
        });
        refetch();
      },
      onError: (error) => toast({ description: error.message }),
    }),
  );

  const readFile = async (file: File) => {
    try {
      setPendingList({
        list: await readParticipantList(file),
        fileName: file.name,
      });
    } catch (error) {
      toast({
        description:
          error instanceof Error ? error.message : t("participants.readError"),
      });
    }
  };

  const statusLabel = (status: string) =>
    t(`participants.status.${toStatus(status)}`);

  const exportLinks = () => {
    if (!data || !typebot) return;
    downloadParticipantLinks({
      fileName: `${typebot.name} - link partecipanti.csv`,
      columns:
        data.panel?.columns.mappings.map((mapping) => mapping.column) ?? [],
      participants: data.participants.map((participant) => ({
        data: participant.data,
        link: participant.link,
        statusLabel: statusLabel(participant.status),
      })),
      linkColumn: t("participants.table.link"),
      statusColumn: t("participants.table.status"),
    });
  };

  const participants = data?.participants ?? [];
  const isWriteMode = currentUserMode === "write";
  const counts = Object.fromEntries(
    participantStatuses.map((status) => [
      status,
      participants.filter(
        (participant) => toStatus(participant.status) === status,
      ).length,
    ]),
  );
  const normalizedSearch = search.trim().toLowerCase();
  const filteredParticipants = normalizedSearch
    ? participants.filter((participant) =>
        [
          participant.externalId,
          participant.checkpoint,
          ...Object.values(participant.data),
        ]
          .map((value) => String(value ?? "").toLowerCase())
          .some((value) => value.includes(normalizedSearch)),
      )
    : participants;
  const unsentCount = participants.filter(
    (participant) => !participant.airtableRecordId,
  ).length;

  return (
    <div className="flex flex-col pb-40">
      <Seo
        title={
          typebot?.name
            ? `${typebot.name} | ${t("participants.heading")}`
            : t("participants.heading")
        }
      />
      <TypebotHeader />
      <div className="flex justify-center px-4">
        <div className="flex flex-col max-w-5xl flex-1 pt-10 gap-8">
          <div className="flex flex-col gap-2">
            <h2>{t("participants.heading")}</h2>
            <p className="text-sm text-gray-11">
              {t("participants.description")}
            </p>
          </div>

          {!publishedTypebot && (
            <Alert.Root variant="info">
              <Alert.Description>
                {t("participants.notPublished")}
              </Alert.Description>
            </Alert.Root>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {isWriteMode && (
              <>
                <input
                  id={fileInputId}
                  type="file"
                  className="hidden"
                  accept=".xlsx,.csv,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) readFile(file);
                    event.target.value = "";
                  }}
                />
                <label
                  htmlFor={fileInputId}
                  className={buttonVariants({ variant: "default" })}
                >
                  {participants.length
                    ? t("participants.uploadMore")
                    : t("participants.upload")}
                </label>
              </>
            )}
            <Button
              variant="secondary"
              disabled={participants.length === 0}
              onClick={exportLinks}
            >
              {t("participants.export")}
            </Button>
            {isWriteMode && participants.length > 0 && (
              <Button
                variant="ghost"
                onClick={() => setIsDeleteDialogOpen(true)}
              >
                {t("participants.deleteAll")}
              </Button>
            )}
          </div>

          {participants.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <Badge>
                {t("participants.total", { count: participants.length })}
              </Badge>
              {participantStatuses.map((status) => (
                <Badge key={status} colorScheme={statusColors[status]}>
                  {statusLabel(status)}: {counts[status]}
                </Badge>
              ))}
            </div>
          )}

          {typebot && isWriteMode && data && (
            <AirtableDashboardCard
              // Fields start from the saved connection once it is loaded.
              key={`${data.panel?.airtable?.baseId}-${data.panel?.airtable?.tableId}`}
              typebotId={typebot.id}
              airtable={data.panel?.airtable ?? null}
              unsentCount={unsentCount}
              onChange={refetch}
            />
          )}

          {participants.length > 0 && (
            <div className="flex flex-col gap-3">
              <Input
                value={search}
                placeholder={t("participants.search")}
                onValueChange={setSearch}
              />
              <Table.Root>
                <Table.Header>
                  <Table.Row>
                    <Table.Head>{t("participants.table.id")}</Table.Head>
                    <Table.Head>{t("participants.table.status")}</Table.Head>
                    <Table.Head>
                      {t("participants.table.checkpoint")}
                    </Table.Head>
                    <Table.Head>
                      {t("participants.table.lastActivity")}
                    </Table.Head>
                    <Table.Head>{t("participants.table.link")}</Table.Head>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {filteredParticipants
                    .slice(0, maxDisplayedRows)
                    .map((participant) => (
                      <Table.Row key={participant.id}>
                        <Table.Cell className="font-medium">
                          {participant.externalId ?? participant.token}
                        </Table.Cell>
                        <Table.Cell>
                          <Badge
                            colorScheme={
                              statusColors[toStatus(participant.status)]
                            }
                          >
                            {statusLabel(participant.status)}
                          </Badge>
                        </Table.Cell>
                        <Table.Cell>{participant.checkpoint}</Table.Cell>
                        <Table.Cell className="text-gray-11">
                          {participant.lastActivityAt
                            ? new Date(
                                participant.lastActivityAt,
                              ).toLocaleString()
                            : ""}
                        </Table.Cell>
                        <Table.Cell>
                          <CopyButton textToCopy={participant.link} />
                        </Table.Cell>
                      </Table.Row>
                    ))}
                </Table.Body>
              </Table.Root>
              {filteredParticipants.length > maxDisplayedRows && (
                <p className="text-sm text-gray-10">
                  {t("participants.moreRows", {
                    count: filteredParticipants.length - maxDisplayedRows,
                  })}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {pendingList && (
        <ImportParticipantsDialog
          list={pendingList.list}
          fileName={pendingList.fileName}
          currentColumns={data?.panel?.columns}
          onClose={() => setPendingList(undefined)}
          onImported={() => {
            setPendingList(undefined);
            refetch();
          }}
        />
      )}

      <AlertDialog.Root
        isOpen={isDeleteDialogOpen}
        onClose={() => setIsDeleteDialogOpen(false)}
      >
        <AlertDialog.Content initialFocus={deleteCancelRef}>
          <AlertDialog.Header>
            <AlertDialog.Title>{t("participants.deleteAll")}</AlertDialog.Title>
            <AlertDialog.Description>
              {t("participants.deleteAllConfirmation", {
                count: participants.length,
              })}
            </AlertDialog.Description>
          </AlertDialog.Header>
          <AlertDialog.Footer>
            <AlertDialog.Cancel ref={deleteCancelRef}>
              {t("cancel")}
            </AlertDialog.Cancel>
            <AlertDialog.Action
              variant="destructive"
              onClick={() => {
                if (typebot) deleteParticipants({ typebotId: typebot.id });
                setIsDeleteDialogOpen(false);
              }}
            >
              {t("participants.deleteAll")}
            </AlertDialog.Action>
          </AlertDialog.Footer>
        </AlertDialog.Content>
      </AlertDialog.Root>
    </div>
  );
};

const toStatus = (status: string): ParticipantStatus =>
  participantStatuses.find((candidate) => candidate === status) ??
  "NOT_STARTED";
