import { ORPCError } from "@orpc/client";
import { useQuery } from "@tanstack/react-query";
import { parseUniqueKey } from "@typebot.io/lib/parseUniqueKey";
import { byId, isDefined } from "@typebot.io/lib/utils";
import { convertResultsToTableData } from "@typebot.io/results/convertResultsToTableData";
import { getExportFileName } from "@typebot.io/results/getExportFileName";
import { parseBlockIdVariableIdMap } from "@typebot.io/results/parseBlockIdVariableIdMap";
import { parseColumnsOrder } from "@typebot.io/results/parseColumnsOrder";
import { parseResultHeader } from "@typebot.io/results/parseResultHeader";
import {
  type ResearchExportOptions,
  researchExportOptionsSchema,
} from "@typebot.io/results/research/schemas";
import { sanitizeCsvCell } from "@typebot.io/results/sanitizeCsvCell";
import {
  type TimeFilter,
  timeFilterLabels,
} from "@typebot.io/results/timeFilter";
import type { Typebot } from "@typebot.io/typebot/schemas/typebot";
import { Alert } from "@typebot.io/ui/components/Alert";
import { Button } from "@typebot.io/ui/components/Button";
import { Dialog } from "@typebot.io/ui/components/Dialog";
import { Field } from "@typebot.io/ui/components/Field";
import { Input } from "@typebot.io/ui/components/Input";
import { MoreInfoTooltip } from "@typebot.io/ui/components/MoreInfoTooltip";
import { Progress } from "@typebot.io/ui/components/Progress";
import { Switch } from "@typebot.io/ui/components/Switch";
import { unparse } from "papaparse";
import { useState } from "react";
import { BasicSelect } from "@/components/inputs/BasicSelect";
import { TimeFilterSelect } from "@/features/analytics/components/TimeFilterSelect";
import { useTypebot } from "@/features/editor/providers/TypebotProvider";
import { orpc, orpcClient } from "@/lib/queryClient";
import { toast } from "@/lib/toast";
import { useResults } from "../../ResultsProvider";
import { ExportJobProgress } from "./ExportJobProgress";

const TOTAL_RESULTS_THRESHOLD_FOR_BACKGROUND_EXPORT = 10000;
const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

type Props = {
  isOpen: boolean;
  onClose: () => void;
  timeFilter: TimeFilter;
};

export const ExportAllResultsDialog = ({
  isOpen,
  onClose,
  timeFilter,
}: Props) => {
  const { typebot, publishedTypebot } = useTypebot();
  const workspaceId = typebot?.workspaceId;
  const typebotId = typebot?.id;
  const { resultHeader: existingResultHeader } = useResults();
  const [isExportLoading, setIsExportLoading] = useState(false);
  const [exportProgressValue, setExportProgressValue] = useState(0);
  const [isSchedulingEmail, setIsSchedulingEmail] = useState(false);
  const [exportWorkflowId, setExportWorkflowId] = useState<string>();
  const [exportWorkflowError, setExportWorkflowError] = useState<string>();

  const [areDeletedBlocksIncluded, setAreDeletedBlocksIncluded] =
    useState(false);
  const [exportFormat, setExportFormat] = useState<"research" | "legacy">(
    "research",
  );
  const [researchOptions, setResearchOptions] = useState<ResearchExportOptions>(
    () =>
      researchExportOptionsSchema.parse({
        fileFormat: "sav",
        multipleChoiceMode: "dichotomous",
      }),
  );
  const [isCodebookDownloaded, setIsCodebookDownloaded] = useState(true);
  const updateResearchOptions = (changes: Partial<ResearchExportOptions>) =>
    setResearchOptions((currentOptions) => ({
      ...currentOptions,
      ...changes,
    }));
  const [timeFilterOverride, setTimeFilterOverride] = useState<TimeFilter>();
  const selectedTimeFilter = timeFilterOverride ?? timeFilter;

  const { data: exportJobStatus, error: exportJobStatusError } = useQuery({
    queryKey: ["resultsExportJob", typebotId, exportWorkflowId],
    queryFn: () => {
      if (!typebotId || !exportWorkflowId)
        throw new Error("Export job ID is missing");
      return orpcClient.results.getExportJobStatus({
        typebotId,
        workflowId: exportWorkflowId,
      });
    },
    enabled: isOpen && isDefined(typebotId) && isDefined(exportWorkflowId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "completed" || status === "error" ? false : 2000;
    },
    refetchIntervalInBackground: true,
  });
  const exportWorkflowChunk =
    exportJobStatus ??
    (exportWorkflowId
      ? { status: "starting" as const, workflowId: exportWorkflowId }
      : undefined);

  const { data: publishedVersionsData } = useQuery(
    orpc.typebot.listPublishedVersions.queryOptions({
      input: {
        typebotId: typebotId as string,
      },
      enabled: isOpen && isDefined(typebotId),
    }),
  );

  const { data: linkedTypebotsData } = useQuery(
    orpc.getLinkedTypebots.queryOptions({
      input: {
        typebotId: typebotId as string,
      },
      enabled: isDefined(typebotId),
    }),
  );

  const getAllResults = async (totalStarts: number) => {
    if (!workspaceId || !typebotId) return [];

    const allResults = [];
    let cursor: any = 0;
    setExportProgressValue(0);
    do {
      try {
        const { results, nextCursor } = await orpcClient.results.getResults({
          typebotId,
          limit: 500,
          cursor,
          timeFilter: selectedTimeFilter,
          timeZone,
        });
        allResults.push(...results);
        setExportProgressValue((allResults.length / totalStarts) * 100);
        cursor = nextCursor ?? undefined;
      } catch (error) {
        if (error instanceof ORPCError && error.message)
          toast({ description: error.message });
        return [];
      }
    } while (cursor);

    return allResults;
  };

  const exportResearchDataset = async (typebotId: string) => {
    try {
      const {
        csv,
        longCsv,
        longCsvFileName,
        savBase64,
        codebook,
        csvFileName,
        savFileName,
        codebookFileName,
      } = await orpcClient.results.exportResearchDataset({
        typebotId,
        timeFilter: selectedTimeFilter,
        timeZone,
        options: researchOptions,
      });
      if (savBase64)
        downloadFile(
          base64ToBytes(savBase64),
          savFileName,
          "application/x-spss-sav",
        );
      else downloadFile(csv, csvFileName, "text/csv;charset=utf-8;");
      if (longCsv)
        downloadFile(longCsv, longCsvFileName, "text/csv;charset=utf-8;");
      if (isCodebookDownloaded)
        downloadFile(codebook, codebookFileName, "application/json");
    } catch (error) {
      if (error instanceof ORPCError && error.message)
        toast({ description: error.message });
    } finally {
      setIsExportLoading(false);
    }
  };

  const exportAllResultsToCSV = async () => {
    if (!publishedTypebot || !typebotId) return;

    setIsExportLoading(true);

    const {
      stats: { totalStarts },
    } = await orpcClient.analytics.getStats({
      typebotId,
      timeFilter: selectedTimeFilter,
      timeZone,
    });

    if (totalStarts > TOTAL_RESULTS_THRESHOLD_FOR_BACKGROUND_EXPORT) {
      startBackgroundExport(typebotId, areDeletedBlocksIncluded);
      return;
    }

    if (exportFormat === "research") return exportResearchDataset(typebotId);

    const results = await getAllResults(totalStarts);

    if (!results.length) return setIsExportLoading(false);

    // Parsed with all the results: loop columns of every exported answer.
    const allResultsHeader = parseResultHeader({
      typebot: publishedTypebot,
      linkedTypebots: linkedTypebotsData?.typebots as Pick<
        Typebot,
        "groups" | "variables"
      >[],
      results,
    });
    const resultHeader = areDeletedBlocksIncluded
      ? allResultsHeader
      : allResultsHeader.filter(
          (header) =>
            header.loopSlot ||
            existingResultHeader.some(
              (existingHeader) => existingHeader.id === header.id,
            ),
        );

    const dataToUnparse = convertResultsToTableData({
      results,
      headerCells: resultHeader,
      blockIdVariableIdMap: parseBlockIdVariableIdMap(typebot?.groups),
    });

    const headerIds = parseColumnsOrder(
      typebot?.resultsTablePreferences?.columnsOrder,
      resultHeader,
    ).reduce<string[]>((currentHeaderIds, columnId) => {
      if (
        typebot?.resultsTablePreferences?.columnsVisibility[columnId] === false
      )
        return currentHeaderIds;
      const columnLabel = resultHeader.find(
        (headerCell) => headerCell.id === columnId,
      )?.id;
      if (!columnLabel) return currentHeaderIds;
      currentHeaderIds.push(columnLabel);
      return currentHeaderIds;
    }, []);

    const data = dataToUnparse.map<{ [key: string]: string }>((data) => {
      const newObject: { [key: string]: string } = {};
      headerIds?.forEach((headerId) => {
        const headerLabel = resultHeader.find(byId(headerId))?.label;
        if (!headerLabel) return;
        const newKey = parseUniqueKey(
          sanitizeCsvCell(headerLabel),
          Object.keys(newObject),
        );
        newObject[newKey] = sanitizeCsvCell(data[headerId]?.plainText);
      });
      return newObject;
    });

    const csvData = new Blob([unparse(data)], {
      type: "text/csv;charset=utf-8;",
    });
    const fileName = getExportFileName(typebot, selectedTimeFilter);
    const tempLink = document.createElement("a");
    tempLink.href = window.URL.createObjectURL(csvData);
    tempLink.setAttribute("download", fileName);
    tempLink.click();
    setIsExportLoading(false);
  };

  const startBackgroundExport = async (
    typebotId: string,
    includeDeletedBlocks: boolean,
  ) => {
    setExportWorkflowError(undefined);
    try {
      const { workflowId } = await orpcClient.results.startExportJob({
        typebotId,
        includeDeletedBlocks,
        timeFilter: selectedTimeFilter,
        timeZone,
        researchOptions:
          exportFormat === "research" ? researchOptions : undefined,
      });
      setExportWorkflowId(workflowId);
    } catch (error) {
      console.error(error);
      if (error instanceof ORPCError) setExportWorkflowError(error.message);
      else if (error instanceof Error) setExportWorkflowError(error.message);
    } finally {
      setIsExportLoading(false);
    }
  };

  const sendExportedResultsToEmail = async () => {
    if (!exportWorkflowId || !typebotId) return;
    setIsSchedulingEmail(true);
    try {
      await orpcClient.results.triggerSendExportResultsToEmail({
        workflowId: exportWorkflowId,
        typebotId,
      });
    } catch (error) {
      console.error(error);
      toast({ description: "Could not schedule the export email" });
    } finally {
      setIsSchedulingEmail(false);
    }
  };

  const exportTitle =
    selectedTimeFilter === "allTime"
      ? "Export all results"
      : `Export results from ${timeFilterLabels[selectedTimeFilter].toLowerCase()}`;

  return (
    <Dialog.Root
      isOpen={isOpen}
      onClose={onClose}
      onCloseComplete={() => {
        const shouldSendEmail =
          exportWorkflowId &&
          (exportWorkflowChunk?.status === "starting" ||
            exportWorkflowChunk?.status === "in_progress") &&
          !isSchedulingEmail &&
          !exportWorkflowError;
        setTimeFilterOverride(undefined);
        if (shouldSendEmail) sendExportedResultsToEmail();
      }}
    >
      <Dialog.Popup className="max-w-md">
        <Dialog.Title>{exportTitle}</Dialog.Title>
        <Dialog.CloseButton />
        {exportWorkflowChunk ? (
          <div className="flex flex-col gap-3">
            <ExportJobProgress chunk={exportWorkflowChunk} />
            {exportJobStatusError && (
              <Alert.Root variant="error">
                <Alert.Description>
                  Could not refresh export status. Retrying...
                </Alert.Description>
              </Alert.Root>
            )}
          </div>
        ) : isExportLoading ? (
          <div className="flex flex-col gap-2">
            <p>Fetching all results...</p>
            <Progress.Root value={exportProgressValue} />
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {exportWorkflowError && (
              <Alert.Root variant="error">
                <Alert.Description>{exportWorkflowError}</Alert.Description>
              </Alert.Root>
            )}
            <Field.Root>
              <Field.Label>Time period</Field.Label>
              <TimeFilterSelect
                timeFilter={selectedTimeFilter}
                onTimeFilterChange={setTimeFilterOverride}
                className="w-full"
              />
            </Field.Root>
            <Field.Root>
              <Field.Label>Format</Field.Label>
              <BasicSelect
                items={[
                  {
                    label: "Research dataset (codes, status, versions)",
                    value: "research" as const,
                  },
                  { label: "Legacy (results table)", value: "legacy" as const },
                ]}
                value={exportFormat}
                onChange={setExportFormat}
                className="w-full"
              />
            </Field.Root>
            {exportFormat === "legacy" ? (
              <Field.Root className="flex-row items-center">
                <Switch
                  checked={areDeletedBlocksIncluded}
                  onCheckedChange={setAreDeletedBlocksIncluded}
                />
                <Field.Label>
                  Include deleted blocks{" "}
                  <MoreInfoTooltip>
                    Blocks from previous bot version that have been deleted
                  </MoreInfoTooltip>
                </Field.Label>
              </Field.Root>
            ) : (
              <ResearchExportOptionsFields
                options={researchOptions}
                onChange={updateResearchOptions}
                publishedVersions={publishedVersionsData?.versions ?? []}
                isCodebookDownloaded={isCodebookDownloaded}
                onCodebookDownloadedChange={setIsCodebookDownloaded}
              />
            )}
          </div>
        )}
        {!exportWorkflowChunk && (
          <Dialog.Footer>
            <Button onClick={onClose} variant="ghost" size="sm">
              Cancel
            </Button>
            <Button
              onClick={exportAllResultsToCSV}
              size="sm"
              disabled={isExportLoading}
            >
              Export
            </Button>
          </Dialog.Footer>
        )}
      </Dialog.Popup>
    </Dialog.Root>
  );
};

const base64ToBytes = (base64: string) =>
  Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));

const downloadFile = (
  content: string | Uint8Array<ArrayBuffer>,
  fileName: string,
  type: string,
) => {
  const blob = new Blob([content], { type });
  const tempLink = document.createElement("a");
  tempLink.href = window.URL.createObjectURL(blob);
  tempLink.setAttribute("download", fileName);
  tempLink.click();
};

const ResearchExportOptionsFields = ({
  options,
  onChange,
  publishedVersions,
  isCodebookDownloaded,
  onCodebookDownloadedChange,
}: {
  options: ResearchExportOptions;
  onChange: (changes: Partial<ResearchExportOptions>) => void;
  publishedVersions: {
    versionNumber: number;
    publishedAt: Date;
    isCurrent: boolean;
    totalResults: number;
  }[];
  isCodebookDownloaded: boolean;
  onCodebookDownloadedChange: (isCodebookDownloaded: boolean) => void;
}) => {
  const selectedVersion =
    options.versionNumbers?.length === 1
      ? String(options.versionNumbers[0])
      : "all";
  return (
    <div className="flex flex-col gap-4">
      <Field.Root>
        <Field.Label>Interviews</Field.Label>
        <BasicSelect
          items={[
            { label: "All interviews", value: "all" as const },
            { label: "Complete only", value: "complete" as const },
            {
              label: "Incomplete / abandoned only",
              value: "incomplete" as const,
            },
          ]}
          value={options.statusFilter}
          onChange={(statusFilter) => onChange({ statusFilter })}
          className="w-full"
        />
      </Field.Root>
      <Field.Root>
        <Field.Label>
          Questionnaire version{" "}
          <MoreInfoTooltip>
            Each publish creates an immutable version. Every interview keeps the
            version it was started with.
          </MoreInfoTooltip>
        </Field.Label>
        <BasicSelect
          items={[
            { label: "All versions", value: "all" as const },
            ...publishedVersions.map((version) => ({
              label: `v${version.versionNumber} - ${version.publishedAt.toLocaleDateString()} (${version.totalResults} interviews)${version.isCurrent ? " - current" : ""}`,
              value: String(version.versionNumber),
            })),
          ]}
          value={selectedVersion}
          onChange={(version) =>
            onChange({
              versionNumbers: version === "all" ? undefined : [Number(version)],
            })
          }
          className="w-full"
        />
      </Field.Root>
      {options.versionNumbers && (
        <Field.Root className="flex-row items-center">
          <Switch
            checked={options.includePreVersioningResults}
            onCheckedChange={(includePreVersioningResults) =>
              onChange({ includePreVersioningResults })
            }
          />
          <Field.Label>
            Include interviews started before versioning
          </Field.Label>
        </Field.Root>
      )}
      <Field.Root>
        <Field.Label>Answer values</Field.Label>
        <BasicSelect
          items={[
            { label: "Codes (value)", value: "value" as const },
            { label: "Labels", value: "label" as const },
            { label: "Codes + labels (X and X_LABEL)", value: "both" as const },
          ]}
          value={options.valueMode}
          onChange={(valueMode) => onChange({ valueMode })}
          className="w-full"
        />
      </Field.Root>
      <div className="flex gap-2">
        <Field.Root className="flex-1">
          <Field.Label>Multiple choice</Field.Label>
          <BasicSelect
            items={[
              { label: "Compact (D2 = 1|3|5)", value: "compact" as const },
              {
                label: "Dichotomous (D2_1, D2_2...)",
                value: "dichotomous" as const,
              },
            ]}
            value={options.multipleChoiceMode}
            onChange={(multipleChoiceMode) => onChange({ multipleChoiceMode })}
            className="w-full"
          />
        </Field.Root>
        {options.multipleChoiceMode === "compact" && (
          <Field.Root className="w-24">
            <Field.Label>Separator</Field.Label>
            <Input
              value={options.multipleChoiceSeparator}
              maxLength={3}
              onValueChange={(multipleChoiceSeparator) =>
                multipleChoiceSeparator.length > 0 &&
                !/[\r\n"]/.test(multipleChoiceSeparator) &&
                onChange({ multipleChoiceSeparator })
              }
            />
          </Field.Root>
        )}
      </div>
      <Field.Root>
        <Field.Label>
          Repeated answers{" "}
          <MoreInfoTooltip>
            When the same block is answered several times (loops, probing),
            every answer is kept.
          </MoreInfoTooltip>
        </Field.Label>
        <BasicSelect
          items={[
            {
              label: "One column per answer (PROBE_1_1, PROBE_1_2...)",
              value: "columns" as const,
            },
            { label: "JSON list in one column", value: "json" as const },
            { label: "Last answer only", value: "last" as const },
          ]}
          value={options.repeatedAnswersMode}
          onChange={(repeatedAnswersMode) => onChange({ repeatedAnswersMode })}
          className="w-full"
        />
      </Field.Root>
      <Field.Root>
        <Field.Label>
          Loop columns{" "}
          <MoreInfoTooltip>
            Wide columns of questions asked inside a Loop block: named after the
            item (D2_NIKE) or after the iteration number (D2_1).
          </MoreInfoTooltip>
        </Field.Label>
        <BasicSelect
          items={[
            { label: "By item (D2_NIKE)", value: "item" as const },
            { label: "By iteration (D2_1)", value: "iteration" as const },
          ]}
          value={options.loopColumnNaming}
          onChange={(loopColumnNaming) => onChange({ loopColumnNaming })}
          className="w-full"
        />
      </Field.Root>
      <Field.Root className="flex-row items-center">
        <Switch
          checked={options.includeScores}
          onCheckedChange={(includeScores) => onChange({ includeScores })}
        />
        <Field.Label>
          Include scores{" "}
          <MoreInfoTooltip>
            Adds D1_SCORE next to D1 and D1_LABEL for questions with scored
            options (matrices: one score per row plus the total).
          </MoreInfoTooltip>
        </Field.Label>
      </Field.Root>
      <Field.Root className="flex-row items-center">
        <Switch
          checked={options.includeLongFormat}
          onCheckedChange={(includeLongFormat) =>
            onChange({ includeLongFormat })
          }
        />
        <Field.Label>
          Also download long format{" "}
          <MoreInfoTooltip>
            Extra CSV with one row per answer: RESULT_ID, LOOP, ITERATION, ITEM,
            QUESTION, VALUE, LABEL, SCORE, TEXT.
          </MoreInfoTooltip>
        </Field.Label>
      </Field.Root>
      <Field.Root>
        <Field.Label>
          File{" "}
          <MoreInfoTooltip>
            SPSS .sav includes variable labels, value labels, missing values,
            measurement levels and multiple response sets. Use dichotomous
            multiple choice and codes for SPSS.
          </MoreInfoTooltip>
        </Field.Label>
        <BasicSelect
          items={[
            { label: "SPSS (.sav)", value: "sav" as const },
            { label: "CSV", value: "csv" as const },
          ]}
          value={options.fileFormat}
          onChange={(fileFormat) =>
            onChange(
              fileFormat === "sav"
                ? { fileFormat, multipleChoiceMode: "dichotomous" }
                : { fileFormat },
            )
          }
          className="w-full"
        />
      </Field.Root>
      {options.fileFormat === "csv" && (
        <Field.Root>
          <Field.Label>CSV</Field.Label>
          <BasicSelect
            items={[
              { label: "Excel-safe CSV", value: "excelSafe" as const },
              { label: "Raw CSV", value: "raw" as const },
            ]}
            value={options.csvMode}
            onChange={(csvMode) => onChange({ csvMode })}
            className="w-full"
          />
        </Field.Root>
      )}
      {options.fileFormat === "csv" && options.csvMode === "raw" && (
        <Alert.Root variant="warning">
          <Alert.Description>
            Raw CSV writes answers exactly as typed by respondents. Opening it
            in Excel or Google Sheets can execute formulas contained in the
            answers (CSV injection). Use it only with statistical software.
          </Alert.Description>
        </Alert.Root>
      )}
      <Field.Root className="flex-row items-center">
        <Switch
          checked={options.includeNotStarted}
          onCheckedChange={(includeNotStarted) =>
            onChange({ includeNotStarted })
          }
        />
        <Field.Label>Include NOT_STARTED (opened, never answered)</Field.Label>
      </Field.Root>
      <Field.Root className="flex-row items-center">
        <Switch
          checked={isCodebookDownloaded}
          onCheckedChange={onCodebookDownloadedChange}
        />
        <Field.Label>
          Download codebook{" "}
          <MoreInfoTooltip>
            JSON with variable labels, value labels, missing values, types and
            multiple response sets, ready to build an SPSS .sav file.
          </MoreInfoTooltip>
        </Field.Label>
      </Field.Root>
    </div>
  );
};
