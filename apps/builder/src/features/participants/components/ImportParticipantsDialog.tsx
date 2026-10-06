import { createId } from "@paralleldrive/cuid2";
import { useMutation } from "@tanstack/react-query";
import { useTranslate } from "@tolgee/react";
import type { ParticipantPanelColumns } from "@typebot.io/bot-engine/participants/schemas";
import { Button } from "@typebot.io/ui/components/Button";
import { Dialog } from "@typebot.io/ui/components/Dialog";
import { Field } from "@typebot.io/ui/components/Field";
import { Switch } from "@typebot.io/ui/components/Switch";
import { Table } from "@typebot.io/ui/components/Table";
import { useState } from "react";
import { BasicSelect } from "@/components/inputs/BasicSelect";
import { useTypebot } from "@/features/editor/providers/TypebotProvider";
import { orpc } from "@/lib/queryClient";
import { toast } from "@/lib/toast";
import type { ParticipantList } from "../helpers/readParticipantList";

const ignoreValue = "__ignore__";
const newVariablePrefix = "__new__:";
const noIdValue = "__none__";

type Props = {
  list: ParticipantList;
  fileName: string;
  currentColumns: ParticipantPanelColumns | undefined;
  onClose: () => void;
  onImported: () => void;
};

/**
 * Step 2 of the respondent list: which column identifies the participant and
 * which columns become bot variables (usable in texts and conditions).
 */
export const ImportParticipantsDialog = ({
  list,
  fileName,
  currentColumns,
  onClose,
  onImported,
}: Props) => {
  const { t } = useTranslate();
  const { typebot, updateTypebot } = useTypebot();
  const [idColumn, setIdColumn] = useState(() => guessIdColumn(list.columns));
  const [targets, setTargets] = useState(() =>
    Object.fromEntries(
      list.columns.map((column) => [
        column,
        guessTarget(column, typebot?.variables ?? [], currentColumns),
      ]),
    ),
  );
  const [isLinkRequired, setIsLinkRequired] = useState(
    currentColumns?.isLinkRequired ?? true,
  );

  const { mutate: importParticipants, isPending } = useMutation(
    orpc.participants.importParticipants.mutationOptions({
      onSuccess: (data) => {
        toast({
          type: "success",
          description: t("participants.import.done", {
            created: data.createdCount,
            updated: data.updatedCount,
          }),
        });
        if (data.duplicateCount > 0)
          toast({
            description: t("participants.import.duplicates", {
              count: data.duplicateCount,
            }),
          });
        if (data.airtableError)
          toast({
            description: `${t("participants.airtable.sendError")} ${data.airtableError}`,
          });
        onImported();
      },
      onError: (error) => toast({ description: error.message }),
    }),
  );

  if (!typebot) return null;

  const importList = async () => {
    const newVariableNames = Object.values(targets).flatMap((target) =>
      target.startsWith(newVariablePrefix)
        ? [target.slice(newVariablePrefix.length)]
        : [],
    );
    const missingVariables = newVariableNames.filter(
      (name) => !typebot.variables.some((variable) => variable.name === name),
    );
    if (missingVariables.length > 0)
      await updateTypebot({
        updates: {
          variables: [
            ...typebot.variables,
            ...missingVariables.map((name) => ({ id: `v${createId()}`, name })),
          ],
        },
        save: true,
      });
    importParticipants({
      typebotId: typebot.id,
      idColumn: idColumn === noIdValue ? null : idColumn,
      columns: {
        isLinkRequired,
        mappings: list.columns.map((column) => {
          const target = targets[column] ?? ignoreValue;
          return {
            column,
            variableName:
              target === ignoreValue
                ? null
                : target.startsWith(newVariablePrefix)
                  ? target.slice(newVariablePrefix.length)
                  : target,
          };
        }),
      },
      rows: list.rows,
    });
  };

  const firstRow = list.rows[0] ?? {};

  return (
    <Dialog.Root isOpen onClose={onClose}>
      <Dialog.Popup className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <Dialog.Title>{t("participants.import.title")}</Dialog.Title>
        <Dialog.CloseButton />
        <p className="text-sm text-gray-11">
          {t("participants.import.description", {
            fileName,
            count: list.rows.length,
          })}
        </p>
        <Field.Root>
          <Field.Label>{t("participants.import.idColumn")}</Field.Label>
          <BasicSelect
            value={idColumn}
            items={[
              { label: t("participants.import.noIdColumn"), value: noIdValue },
              ...list.columns.map((column) => ({
                label: column,
                value: column,
              })),
            ]}
            onChange={setIdColumn}
          />
          <Field.Description>
            {t("participants.import.idColumnHelp")}
          </Field.Description>
        </Field.Root>
        <Table.Root>
          <Table.Header>
            <Table.Row>
              <Table.Head>{t("participants.import.column")}</Table.Head>
              <Table.Head>{t("participants.import.example")}</Table.Head>
              <Table.Head>{t("participants.import.variable")}</Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {list.columns.map((column) => (
              <Table.Row key={column}>
                <Table.Cell className="font-medium">{column}</Table.Cell>
                <Table.Cell className="text-gray-11">
                  {firstRow[column]}
                </Table.Cell>
                <Table.Cell>
                  <BasicSelect
                    className="min-w-56"
                    value={targets[column] ?? ignoreValue}
                    items={[
                      {
                        label: t("participants.import.ignore"),
                        value: ignoreValue,
                      },
                      ...(typebot.variables.some(
                        (variable) => variable.name === column,
                      )
                        ? []
                        : [
                            {
                              label: t("participants.import.newVariable", {
                                name: column,
                              }),
                              value: `${newVariablePrefix}${column}`,
                            },
                          ]),
                      ...typebot.variables.map((variable) => ({
                        label: `{{${variable.name}}}`,
                        value: variable.name,
                      })),
                    ]}
                    onChange={(target) =>
                      setTargets((current) => ({
                        ...current,
                        [column]: target,
                      }))
                    }
                  />
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
        <Field.Root className="flex-row items-center">
          <Switch
            checked={isLinkRequired}
            onCheckedChange={setIsLinkRequired}
          />
          <Field.Label>{t("participants.import.isLinkRequired")}</Field.Label>
        </Field.Root>
        <Dialog.Footer>
          <Button variant="secondary" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button disabled={isPending} onClick={importList}>
            {t("participants.import.submit", { count: list.rows.length })}
          </Button>
        </Dialog.Footer>
      </Dialog.Popup>
    </Dialog.Root>
  );
};

const guessIdColumn = (columns: string[]) =>
  columns.find((column) =>
    /^(id|codice|code|uid|cid|telefono|cellulare|phone|email)$/i.test(
      column.trim(),
    ),
  ) ??
  columns[0] ??
  noIdValue;

const guessTarget = (
  column: string,
  variables: { name: string }[],
  currentColumns: ParticipantPanelColumns | undefined,
) => {
  const previous = currentColumns?.mappings.find(
    (mapping) => mapping.column === column,
  );
  if (previous) return previous.variableName ?? ignoreValue;
  const existing = variables.find(
    (variable) => variable.name.toLowerCase() === column.trim().toLowerCase(),
  );
  return existing ? existing.name : `${newVariablePrefix}${column}`;
};
