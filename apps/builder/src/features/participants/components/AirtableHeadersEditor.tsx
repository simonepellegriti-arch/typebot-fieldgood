import { useTranslate } from "@tolgee/react";
import { Accordion } from "@typebot.io/ui/components/Accordion";
import { Button } from "@typebot.io/ui/components/Button";
import { Input } from "@typebot.io/ui/components/Input";
import { useState } from "react";

type Props = {
  headers: { variableName: string; header: string }[];
  isSaving: boolean;
  onSave: (changedHeaders: Record<string, string>) => void;
};

/**
 * Airtable headers of the answer columns (short question titles), editable
 * one by one: saving renames the fields on Airtable. The FIELDBOT export keeps
 * the codes.
 */
export const AirtableHeadersEditor = ({ headers, isSaving, onSave }: Props) => {
  const { t } = useTranslate();
  const [editedHeaders, setEditedHeaders] = useState<Record<string, string>>(
    {},
  );

  const save = () => {
    onSave(changedHeaders);
    setEditedHeaders({});
  };

  const changedHeaders = Object.fromEntries(
    Object.entries(editedHeaders).filter(
      ([variableName, header]) =>
        header.trim() &&
        header.trim() !==
          headers.find((column) => column.variableName === variableName)
            ?.header,
    ),
  );
  const changedCount = Object.keys(changedHeaders).length;

  return (
    <Accordion.Root>
      <Accordion.Item>
        <Accordion.Trigger>
          {t("participants.airtable.headers", { count: headers.length })}
        </Accordion.Trigger>
        <Accordion.Panel>
          <p className="text-sm text-gray-11">
            {t("participants.airtable.headersDescription")}
          </p>
          <div className="flex flex-col gap-2 max-h-96 overflow-y-auto">
            {headers.map(({ variableName, header }) => (
              <div key={variableName} className="flex items-center gap-3">
                <span className="w-40 shrink-0 truncate font-mono text-xs text-gray-10">
                  {variableName}
                </span>
                <Input
                  value={editedHeaders[variableName] ?? header}
                  onValueChange={(value) =>
                    setEditedHeaders((current) => ({
                      ...current,
                      [variableName]: value,
                    }))
                  }
                />
              </div>
            ))}
          </div>
          <div className="flex">
            <Button
              variant="secondary"
              disabled={isSaving || changedCount === 0}
              onClick={save}
            >
              {t("participants.airtable.saveHeaders", { count: changedCount })}
            </Button>
          </div>
        </Accordion.Panel>
      </Accordion.Item>
    </Accordion.Root>
  );
};
