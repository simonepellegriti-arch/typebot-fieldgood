import { useMutation } from "@tanstack/react-query";
import { useTranslate } from "@tolgee/react";
import { Badge } from "@typebot.io/ui/components/Badge";
import { Button } from "@typebot.io/ui/components/Button";
import { Field } from "@typebot.io/ui/components/Field";
import { Input } from "@typebot.io/ui/components/Input";
import { useState } from "react";
import { orpc } from "@/lib/queryClient";
import { toast } from "@/lib/toast";
import { AirtableHeadersEditor } from "./AirtableHeadersEditor";

type Props = {
  typebotId: string;
  airtable: {
    baseId: string;
    tableId: string;
    tableName: string | null;
    fieldNames: string[];
    hasToken: boolean;
    headers: { variableName: string; header: string }[];
  } | null;
  unsentCount: number;
  onChange: () => void;
};

/**
 * Airtable as the client's dashboard: one record per participant with its
 * link and status, answers written live after each reply.
 */
export const AirtableDashboardCard = ({
  typebotId,
  airtable,
  unsentCount,
  onChange,
}: Props) => {
  const { t } = useTranslate();
  const [token, setToken] = useState("");
  const [base, setBase] = useState(airtable?.baseId ?? "");
  const [table, setTable] = useState(
    airtable?.tableName ?? airtable?.tableId ?? "",
  );

  const { mutate: connect, isPending: isConnecting } = useMutation(
    orpc.participants.connectAirtable.mutationOptions({
      onSuccess: (data) => {
        setToken("");
        toast({
          type: "success",
          description: t("participants.airtable.connected", {
            table: data.tableName,
          }),
        });
        onChange();
      },
      onError: (error) => toast({ description: error.message }),
    }),
  );
  const { mutate: createFields, isPending: isCreatingFields } = useMutation(
    orpc.participants.createAirtableFields.mutationOptions({
      onSuccess: (data) => {
        toast({
          type:
            data.failed.length || data.remainingCount ? undefined : "success",
          description: data.failed.length
            ? t("participants.airtable.fieldsFailed", {
                names: data.failed.map((field) => field.name).join(", "),
                error: data.failed[0]?.error ?? "",
              })
            : data.remainingCount
              ? t("participants.airtable.fieldsRemaining", {
                  done: data.createdCount + data.renamedCount,
                  count: data.remainingCount,
                })
              : t("participants.airtable.fieldsUpdated", {
                  created: data.createdCount,
                  renamed: data.renamedCount,
                }),
        });
        onChange();
      },
      onError: (error) => toast({ description: error.message }),
    }),
  );
  const { mutate: sendParticipants, isPending: isSending } = useMutation(
    orpc.participants.sendToAirtable.mutationOptions({
      onSuccess: (data) => {
        toast({
          type: "success",
          description: t("participants.airtable.sent", {
            count: data.sentCount,
          }),
        });
        onChange();
      },
      onError: (error) => toast({ description: error.message }),
    }),
  );

  const submitConnection = () => {
    // A link to the table works too: https://airtable.com/appXXX/tblYYY/viwZZZ
    const baseId = base.match(/app[A-Za-z0-9]{8,}/)?.[0] ?? base.trim();
    const tableFromLink = base.match(/tbl[A-Za-z0-9]{8,}/)?.[0];
    connect({
      typebotId,
      baseId,
      table: table.trim() || tableFromLink || "",
      ...(token.trim() ? { token: token.trim() } : {}),
    });
  };

  return (
    <div className="flex flex-col gap-4 p-4 rounded-lg border bg-gray-1">
      <div className="flex items-center gap-2">
        <h3 className="font-medium">{t("participants.airtable.heading")}</h3>
        {airtable ? (
          <Badge colorScheme="green">
            {airtable.tableName ?? airtable.tableId}
          </Badge>
        ) : (
          <Badge>{t("participants.airtable.notConnected")}</Badge>
        )}
      </div>
      <p className="text-sm text-gray-11">
        {t("participants.airtable.description")}
      </p>
      <div className="flex flex-wrap gap-3">
        <Field.Root className="flex-1 min-w-56">
          <Field.Label>{t("participants.airtable.token")}</Field.Label>
          <Input
            type="password"
            autoComplete="off"
            value={token}
            placeholder={
              airtable?.hasToken
                ? t("participants.airtable.tokenSaved")
                : "pat…"
            }
            onValueChange={setToken}
          />
        </Field.Root>
        <Field.Root className="flex-1 min-w-56">
          <Field.Label>{t("participants.airtable.base")}</Field.Label>
          <Input
            value={base}
            placeholder="app… / https://airtable.com/app…/tbl…"
            onValueChange={setBase}
          />
        </Field.Root>
        <Field.Root className="flex-1 min-w-40">
          <Field.Label>{t("participants.airtable.table")}</Field.Label>
          <Input
            value={table}
            placeholder="tbl… / Partecipanti"
            onValueChange={setTable}
          />
        </Field.Root>
      </div>
      <p className="text-xs text-gray-10">
        {t("participants.airtable.scopes")}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          disabled={
            isConnecting ||
            !base.trim() ||
            (!token.trim() && !airtable?.hasToken)
          }
          onClick={submitConnection}
        >
          {airtable
            ? t("participants.airtable.update")
            : t("participants.airtable.connect")}
        </Button>
        {airtable && (
          <>
            <Button
              variant="secondary"
              disabled={isCreatingFields}
              onClick={() => createFields({ typebotId })}
            >
              {t("participants.airtable.createFields")}
            </Button>
            <Button
              disabled={isSending || unsentCount === 0}
              onClick={() => sendParticipants({ typebotId })}
            >
              {t("participants.airtable.send", { count: unsentCount })}
            </Button>
          </>
        )}
      </div>
      {airtable && airtable.headers.length > 0 && (
        <AirtableHeadersEditor
          headers={airtable.headers}
          isSaving={isCreatingFields}
          onSave={(headers) => createFields({ typebotId, headers })}
        />
      )}
    </div>
  );
};
